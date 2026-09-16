import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLocalOrderPurchaseFacts as prepare } from '../app/application/local-order-purchase-facts.server.ts';

export function fixture() {
  const product = { id:'product-a', slug:'gift', name:'Historical gift', description:'Historical description', categoryId:'category-a', seo:{}, lifecycle:'published' };
  const variant = { id:'variant-a', productId:product.id, skuCode:'EXACT-SKU', selectedOptions:[], priceCents:101, currency:'USD', isActive:true, isAvailable:true, isDefault:true, weightGrams:1, supplyMethod:'made_to_order' };
  const fulfillment = { id:'fulfillment-a', productId:product.id, fulfillmentType:'physical', requiresShipping:true, productionMode:'custom_manufacturing', leadTime:{minBusinessDays:1,maxBusinessDays:2} };
  const handoff = { productId:product.id, variantId:variant.id, skuCode:variant.skuCode, selectedOptions:[], configurationRevision:'1', customizationValues:[] };
  const line = { cartLine:{lineId:'line-a',quantity:2,handoff}, handoff,
    summary:{lineId:'line-a',productId:product.id,productName:product.name,productSlug:product.slug,variantId:variant.id,skuCode:variant.skuCode,selectedOptions:[],quantity:2,unitBasePriceCents:101,lineSubtotalCents:202,currency:'USD',fulfillmentType:'physical'} };
  return { lines:[line], catalog:{categories:[],products:[product],variants:[variant],options:[],optionValues:[],assets:[],fulfillmentConfigs:[fulfillment]},
    purchasedFulfillments:{[product.id]:{...fulfillment,requiresProductionPreview:true}},
    configurations:[{id:'config-a',product_id:product.id,revision:1,definition:{productId:product.id,configurationRevision:'1',fields:[]}}],
    versions:{'products:product-a':1,'variants:variant-a':1,'configurations:config-a':1}, discountCents:3, shippingCents:7 };
}
test('captures immutable Model C purchase facts and exact integer allocation without changing input',()=>{
  const input=fixture(), before=structuredClone(input), r=prepare(input);
  assert.equal(r.status,'found');assert.deepEqual(input,before);
  const item=r.value.items[0];assert.equal(item.variant.skuCode,'EXACT-SKU');assert.equal(item.quantity,2);
  assert.deepEqual(item.customizationPriceComponents,[]);assert.equal(item.customizationAmountCents,0);
  assert.equal(item.amounts.localArithmeticTotalCents,206);assert.deepEqual(item.amounts.tax,{status:'not_activated',amount:null});
  assert.equal(Object.hasOwn(item,'selectedSpecificationKey'),false);assert.equal(Object.hasOwn(item,'orderItemId'),false);
  assert.ok(Object.isFrozen(item.configuration.fields));
  input.catalog.products[0].name='Changed';input.catalog.variants[0].priceCents=999;input.versions['products:product-a']=2;
  assert.equal(item.product.name,'Historical gift');assert.equal(item.variant.priceCents,101);assert.equal(r.value.versions['products:product-a'],1);
});
test('rejects mismatched server summaries, absent versions and stale configuration',()=>{
  for(const alter of [
    x=>x.lines[0].summary.productName='Browser title',x=>x.lines[0].summary.skuCode='OTHER',
    x=>x.lines[0].summary.lineSubtotalCents=1,x=>x.lines[0].summary.quantity=3,
    x=>x.lines[0].summary.currency='EUR',x=>x.lines[0].summary.fulfillmentType='digital',
    x=>x.configurations[0].revision=2,x=>delete x.versions['variants:variant-a'],
    x=>x.catalog.variants[0].isAvailable=false,x=>x.catalog.products[0].lifecycle='draft',
    x=>x.catalog.fulfillmentConfigs=[],x=>x.catalog.variants.push(structuredClone(x.catalog.variants[0])),
  ]) {const input=fixture();alter(input);assert.equal(prepare(input).status,'unavailable');}
});
test('option identities retain exact historical labels and never infer missing option values',()=>{
  const x=fixture(), selection={optionId:'option-size',valueId:'value-small'};
  x.catalog.options=[{id:'option-size',productId:'product-a',name:'Size',code:'size',position:0}];
  x.catalog.optionValues=[{id:'value-small',optionId:'option-size',productId:'product-a',label:'Small',code:'small',position:0}];
  x.catalog.variants[0].selectedOptions=[selection];x.lines[0].handoff.selectedOptions=[selection];x.lines[0].summary.selectedOptions=[selection];
  const r=prepare(x);assert.equal(r.status,'found');assert.equal(r.value.items[0].selectedOptions[0].value.label,'Small');
  x.catalog.optionValues=[];assert.equal(prepare(x).status,'unavailable');
});
test('quantity greater than one keeps a single receipt selection; a second line needs a distinct receipt',()=>{
  const x=fixture();x.lines[0].handoff.customizationValues=[{fieldId:'image-field',fieldCode:'photo',kind:'image',images:[{receiptId:'receipt-a',crop:{x:0,y:0,width:1,height:1}}]}];
  x.configurations[0].definition.fields=[{id:'image-field',productId:'product-a',code:'photo',label:'Photo',kind:'image',required:true,isActive:true,position:0,configurationRevision:'1',
    constraints:{allowedMimeTypes:['image/png'],maxBytes:5000000,minDimensions:{width:1,height:1},minImageCount:1,maxImageCount:1,cropEnabled:true}}];
  const r=prepare(x);assert.equal(r.status,'found');assert.equal(r.value.items[0].media.length,1);assert.equal(r.value.items[0].quantity,2);
  const second=structuredClone(x.lines[0]);second.cartLine.lineId='line-b';second.summary.lineId='line-b';x.lines.push(second);
  assert.equal(prepare(x).status,'unavailable');
  second.handoff.customizationValues[0].images[0].receiptId='receipt-copy';assert.equal(prepare(x).status,'found');
});
test('digital classification forbids physical shipping and does not invent a postal address',()=>{
  const x=fixture();x.catalog.fulfillmentConfigs[0].fulfillmentType='digital';x.catalog.fulfillmentConfigs[0].requiresShipping=false;
  Object.assign(x.purchasedFulfillments['product-a'],{fulfillmentType:'digital',requiresShipping:false});
  x.lines[0].summary.fulfillmentType='digital';x.shippingCents=0;
  const r=prepare(x);assert.equal(r.status,'found');assert.equal(r.value.amounts.shippingCents,0);
  assert.equal(Object.hasOwn(r.value,'address'),false);x.shippingCents=1;assert.equal(prepare(x).status,'unavailable');
});
test('duplicate canonical Cart line IDs and missing authoritative definitions fail closed',()=>{
  const x=fixture();x.lines.push(structuredClone(x.lines[0]));assert.equal(prepare(x).status,'unavailable');
  const y=fixture();y.configurations=[];assert.equal(prepare(y).status,'unavailable');
  assert.equal(prepare(null).status,'unavailable');
});
