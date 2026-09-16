// Explicitly authorized run only. Every SQL write is rolled back. This is not
// permanent migration or HTTP acceptance evidence, and never changes manifest.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { catalogDatabaseRows, catalogTestEnvironment, offlineCatalogClient, ids } from '../tests/fixtures/local-persistent-catalog.mjs';
import { LocalCatalogAuthority } from '../app/infrastructure/local-commerce/local-catalog-authority.server.ts';
import { prepareLocalOrderPurchaseFacts } from '../app/application/local-order-purchase-facts.server.ts';
import { localOrderPurchaseVersions } from '../app/application/local-order-purchase-versions.server.ts';
import { allocateLocalOrderAmounts } from '../app/application/local-order-allocation.ts';

const container='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
const project='figmemento-local-commerce-test-run-5576dfd8';
const workdir=`${process.cwd()}/local/commerce/runtime/disposable/run-5576dfd8`;
const marker='a9e9004d843753efa456c4e8b66f91ed95d268034fba1166c55d9785dadf815c';
const appliedMode=process.argv.includes('--applied-contract');
const expectedSchema=17;
assert.equal(appliedMode,false,'This harness is rollback-only');
const physical=!process.argv.includes('--digital');
const mixed=process.argv.includes('--mixed');assert.ok(!(mixed&&!physical));
const inspect=spawnSync('docker',['inspect',container],{encoding:'utf8',timeout:5000});
assert.equal(inspect.status,0,inspect.error?.code ?? inspect.stderr);
const target=JSON.parse(inspect.stdout)[0];
assert.equal(target.Id,container);assert.equal(target.State.Status,'running');
assert.equal(target.Config.Labels['com.supabase.cli.workdir'],workdir);
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json','utf8'));
assert.equal(manifest.schemaVersion,expectedSchema);assert.equal(manifest.migrations.length,expectedSchema);
for(const m of manifest.migrations) assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);
const draft=readFileSync('local/commerce/migrations/0016_local-commerce-order-history.sql','utf8');
const legacyCommit=readFileSync('local/commerce/migrations/0014_local-commerce-order-commit.sql','utf8').split('create function local_commerce.order_commit')[1];
assert.ok(legacyCommit);
assert.ok(!/^\s*(begin|commit|rollback)\s*;/mi.test(draft));
const q=v=>`'${String(v).replaceAll("'","''")}'`;
const j=v=>`${q(JSON.stringify(v))}::jsonb`;
const insert=(table,row)=>`INSERT INTO local_commerce.${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(v=>v===null?'NULL':typeof v==='object'?j(v):q(v)).join(',')});`;
let encoded=JSON.stringify(catalogDatabaseRows(project));
for(const id of Object.values(ids)) encoded=encoded.replaceAll(id,randomUUID());
const rows=JSON.parse(encoded), suffix=randomUUID();
rows.categories[0].slug=`preapply-category-${suffix}`;
rows.products[0].slug=`preapply-product-${suffix}`;
rows.products[0].fulfillment_definition.requiresProductionPreview=physical;
rows.variants[0].sku_code=`PREAPPLY-${suffix.toUpperCase()}`;
rows.rules=rows.rules.filter(r=>r.definition.kind==='shipping');
rows.rules[0].rule_key=`preapply-shipping-${suffix}`;
rows.rules[0].definition.method=`preapply_${suffix.replaceAll('-','')}`;
if(!physical) Object.assign(rows.products[0].fulfillment_definition,{fulfillmentType:'digital',requiresShipping:false,productionMode:'digital_creation'});
if(mixed) {
 let bundle=JSON.stringify([rows.products[0],rows.variants[0],rows.configurations[0]]);
 for(const id of new Set(bundle.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g))) if(id!==rows.categories[0].id)bundle=bundle.replaceAll(id,randomUUID());
 const [product,variant,config]=JSON.parse(bundle);
 product.slug=`digital-${suffix}`;variant.sku_code=`DIGITAL-${suffix}`;
 product.fulfillment_definition.requiresProductionPreview=false;
 Object.assign(product.fulfillment_definition,{fulfillmentType:'digital',requiresShipping:false,productionMode:'digital_creation'});
 rows.products.push(product);rows.variants.push(variant);rows.configurations.push(config);
}
// Offline projection builds the expected TS value, NOT database evidence.
const client=offlineCatalogClient(rows);
const read=await new LocalCatalogAuthority(catalogTestEnvironment({LOCAL_COMMERCE_PROJECT_ID:project,LOCAL_COMMERCE_RUN_ID:'run-5576dfd8'}),client).readSnapshot();
assert.equal(read.status,'found');
const baseline=read.value,p=baseline.dataSet.products[0],v=baseline.dataSet.variants[0];
const owner=randomUUID(),cart=randomUUID(),line=randomUUID(),secondLine=randomUUID();
const handoff={productId:p.id,variantId:v.id,skuCode:v.skuCode,selectedOptions:v.selectedOptions,configurationRevision:'1',customizationValues:[]};
const handoffs=[handoff,mixed?{...handoff,productId:baseline.dataSet.products[1].id,variantId:baseline.dataSet.variants[1].id,skuCode:baseline.dataSet.variants[1].skuCode,selectedOptions:baseline.dataSet.variants[1].selectedOptions}:handoff];
const contact={email:'preapply@example.invalid',...(physical?{firstName:'Synthetic',lastName:'Test',country:'US',city:'Test',addressLine1:'Synthetic fixture',postalCode:'00000'}:{})};
const method=rows.rules[0].definition.method;
const versions=localOrderPurchaseVersions({catalog:baseline.dataSet,configurations:baseline.configurations,rules:baseline.rules,versions:baseline.versions,selections:handoffs,requiresShipping:physical,country:'US',method,couponCode:''});
const prepared=prepareLocalOrderPurchaseFacts({purchasedFulfillments:baseline.purchasedFulfillments,catalog:baseline.dataSet,configurations:baseline.configurations,versions,shippingCents:physical?500:0,discountCents:0,
  lines:[line,secondLine].map((lineId,i)=>{const product=baseline.dataSet.products[mixed?i:0],variant=baseline.dataSet.variants[mixed?i:0],h=handoffs[i];return {cartLine:{lineId,quantity:2-i,handoff:h},handoff:h,summary:{lineId,productId:product.id,productSlug:product.slug,productName:product.name,variantId:variant.id,skuCode:variant.skuCode,selectedOptions:variant.selectedOptions,quantity:2-i,unitBasePriceCents:variant.priceCents,lineSubtotalCents:variant.priceCents*(2-i),currency:'USD',fulfillmentType:physical&&!(mixed&&i===1)?'physical':'digital'}};})});
assert.equal(prepared.status,'found');
const facts={...prepared.value,contact,shippingMethod:method,couponCode:'',couponStatus:'not_selected'};
const legacyFacts=structuredClone(facts);
for(const item of legacyFacts.items) delete item.fulfillment.requiresProductionPreview;
for(const p of rows.products) legacyFacts.versions[`products:${p.id}`]=2;
const expected=manifest.migrations.map(m=>`(${m.version},${q(m.checksum)})`).join(',');
const setup=Object.entries({categories:'catalog_categories',products:'catalog_products',variants:'catalog_variants',configurations:'catalog_configuration_snapshots',rules:'catalog_pricing_rules'}).flatMap(([key,table])=>rows[key].map(row=>insert(table,row))).join('\n');
const digest=createHash('sha256').update(suffix).digest('hex');
const rpc=(operation,body=facts,cap='b'.repeat(64),grant="clock_timestamp()+interval '5 minutes'",expiry="clock_timestamp()+interval '10 minutes'")=>`local_commerce.order_commit(${q(project)},${q(marker)},'guest',${q(digest)},NULL,NULL,clock_timestamp()+interval '20 minutes',${q(operation)},${q(cart)},1,${q(digest)},${q('c'.repeat(64))},${q(cap)},${grant},${expiry},${body===null?'NULL':j(body)})`;
const check=(expression,message)=>`IF NOT coalesce((${expression}),false) THEN RAISE EXCEPTION ${q(message)}; END IF;`;
const vectors=[[[0,0,0],[true,false,true],0,3],[[3,2],[true,false],2,1],[[1000000000,1000000000],[true,true],1999999999,0],[[1,1,1],[true,true,true],2,2]];
const allocationChecks=vectors.map(([values,physical,discount,shipping])=>{
 const lines=values.map((subtotalCents,i)=>({lineId:`line-${i}`,subtotalCents,discountEligible:true,requiresShipping:physical[i]}));
 const result=allocateLocalOrderAmounts({lines,discountCents:discount,shippingCents:shipping});assert.equal(result.status,'found');
 const items=lines.map(l=>({cartLineId:l.lineId,subtotalCents:l.subtotalCents,fulfillment:{fulfillmentType:l.requiresShipping?'physical':'digital',requiresShipping:l.requiresShipping}}));
 return check(`local_commerce.order_canonical_allocations(${j(items)},${discount},${shipping})=${j(result.value.lines)}`,'allocator differs from TS');
}).join('\n');
const tampered=structuredClone(facts);tampered.items[0].selectedOptions[0].value.label='FORGED';
const shares=structuredClone(facts);
for(const [i,shipping] of [shares.items[1].amounts.shippingCents,shares.items[0].amounts.shippingCents].entries()) {
  shares.items[i].amounts.shippingCents=shipping;
  shares.items[i].amounts.localArithmeticTotalCents=shares.items[i].subtotalCents+shipping;
  shares.amounts.lines[i]=shares.items[i].amounts;
}
const extraMedia=structuredClone(facts);extraMedia.items[0].media=[{fieldId:'forged',position:0,receiptId:randomUUID()}];
const wrongDefinition=structuredClone(facts);wrongDefinition.items[0].configuration.fields[0].label='FORGED';
const sql=`BEGIN; SET LOCAL statement_timeout='10000ms';
DO $gate$ BEGIN
${check(`local_commerce.verify_project_identity(${q(project)},${q(marker)})`,'marker mismatch')}
${check(`(SELECT count(*) FROM local_commerce.migration_ledger)=${expectedSchema} AND NOT EXISTS(SELECT version,checksum FROM local_commerce.migration_ledger EXCEPT VALUES ${expected})`,'ledger mismatch')}
END $gate$;
${appliedMode?'':draft}
${setup}
${insert('commerce_owners',{project_id:project,id:owner,owner_kind:'guest',subject_hash:digest})}
${insert('carts',{project_id:project,id:cart,owner_id:owner})}
${insert('cart_lines',{project_id:project,id:line,cart_id:cart,owner_id:owner,product_id:p.id,variant_id:v.id,configuration_revision:1,configuration_values:[],quantity:2,position:0,accepted_item:{handoff}})}
${insert('cart_lines',{project_id:project,id:secondLine,cart_id:cart,owner_id:owner,product_id:handoffs[1].productId,variant_id:handoffs[1].variantId,configuration_revision:1,configuration_values:[],quantity:1,position:1,accepted_item:{handoff:handoffs[1]}})}
SAVEPOINT legacy_fixture;
create or replace function local_commerce.order_commit${legacyCommit}
UPDATE local_commerce.catalog_products SET fulfillment_definition=fulfillment_definition-'requiresProductionPreview' WHERE project_id=${q(project)} AND id IN (${rows.products.map(p=>q(p.id)).join(',')});
CREATE TEMP TABLE legacy_history_fixture(value jsonb) ON COMMIT DROP;
INSERT INTO legacy_history_fixture VALUES (${rpc('commit',legacyFacts)});
${draft}
DO $legacy$ DECLARE r jsonb; item_id uuid; BEGIN
  SELECT value INTO r FROM legacy_history_fixture;
  ${check(`r->>'status'='found'`,'legacy synthetic creation failed')}
  SELECT id INTO item_id FROM local_commerce.order_items WHERE project_id=${q(project)} AND order_id=(r#>>'{value,orderId}')::uuid LIMIT 1;
  ${check(`(local_commerce.read_order_history(${q(project)},${q(marker)},'guest',${q(digest)},NULL,NULL,clock_timestamp()+interval '20 minutes',${q('b'.repeat(64))},(r#>>'{value,orderId}')::uuid,r#>>'{value,publicReference}',item_id,'canonical_item'))->>'status'='unavailable'`,'legacy policy inferred')}
  UPDATE local_commerce.catalog_products SET fulfillment_definition=jsonb_set(fulfillment_definition,'{requiresProductionPreview}','true') WHERE project_id=${q(project)} AND id=${q(p.id)};
  ${check(`(local_commerce.read_order_history(${q(project)},${q(marker)},'guest',${q(digest)},NULL,NULL,clock_timestamp()+interval '20 minutes',${q('b'.repeat(64))},(r#>>'{value,orderId}')::uuid,r#>>'{value,publicReference}',item_id,'canonical_item'))->>'status'='unavailable'`,'legacy policy reconstructed after Catalog mutation')}
  ${check(`(local_commerce.read_order_history(${q(project)},${q(marker)},'guest',${q(digest)},NULL,NULL,clock_timestamp()+interval '20 minutes',${q('b'.repeat(64))},NULL,r#>>'{value,publicReference}',NULL,'customer_summary'))->>'status'='found'`,'safe legacy summary broken')}
END $legacy$;
ROLLBACK TO SAVEPOINT legacy_fixture;
SAVEPOINT policy_race;
UPDATE local_commerce.catalog_products SET fulfillment_definition=jsonb_set(fulfillment_definition,'{requiresProductionPreview}',to_jsonb(NOT (fulfillment_definition->>'requiresProductionPreview')::boolean)) WHERE project_id=${q(project)} AND id=${q(p.id)};
DO $race$ BEGIN ${check(`(${rpc('commit')})->>'status'='conflict'`,'stale Product policy/version committed')} END $race$;
ROLLBACK TO SAVEPOINT policy_race;
CREATE FUNCTION pg_temp.fail_synthetic_order_binding() RETURNS trigger LANGUAGE plpgsql AS $inject$ BEGIN RAISE EXCEPTION 'injected final binding failure'; END $inject$;
CREATE TRIGGER preapply_exact_owner_failure BEFORE INSERT ON local_commerce.order_creation_bindings FOR EACH ROW WHEN(NEW.owner_id=${q(owner)}::uuid) EXECUTE FUNCTION pg_temp.fail_synthetic_order_binding();
DO $atomic$ BEGIN
${check(`(${rpc('commit')})->>'status'='unavailable'`,'injected write failure not bounded')}
${['orders','order_items','order_purchase_snapshots','order_item_purchase_snapshots','order_item_receipt_bindings','access_grants','order_creation_bindings'].map(table=>check(`NOT EXISTS(SELECT 1 FROM local_commerce.${table} WHERE project_id=${q(project)} AND owner_id=${q(owner)})`,`partial ${table} survived`)).join('\n')}
END $atomic$;
DROP TRIGGER preapply_exact_owner_failure ON local_commerce.order_creation_bindings;
DO $checks$ DECLARE result jsonb; replay jsonb; BEGIN
${allocationChecks}
${check(`NOT has_table_privilege('anon','local_commerce.order_creation_bindings','SELECT')`,'anon table access')}
${check(`NOT has_function_privilege('authenticated','local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb)','EXECUTE')`,'authenticated RPC access')}
${check(`(${rpc('probe',null)})->>'status'='not_found'`,'probe failed')}
${check(`(${rpc('commit',facts,'b'.repeat(64),"clock_timestamp()+interval '15 minutes'")})->>'status'='unavailable'`,'grant exceeded capability')}
${check(`(${rpc('commit',tampered)})->>'status'='conflict'`,'forged option label accepted')}
${physical?check(`(${rpc('commit',shares)})->>'status'=${q(mixed?'unavailable':'conflict')}`,'noncanonical shipping shares accepted'):''}
${check(`(${rpc('commit',extraMedia)})->>'status'='conflict'`,'extra media accepted')}
${check(`(${rpc('commit',wrongDefinition)})->>'status'='conflict'`,'forged configuration accepted')}
result:=${rpc('commit')};
IF result->>'status'<>'found' THEN RAISE EXCEPTION 'valid commit failed: %',result; END IF;
replay:=${rpc('probe',null)};
${check(`replay#>>'{value,orderId}'=result#>>'{value,orderId}' AND replay#>>'{value,replayed}'='true'`,'replay mismatch')}
${check(`(${rpc('probe',null,'d'.repeat(64))})->>'status'='unavailable'`,'replacement capability claimed Order')}
${check(`(SELECT count(*) FROM local_commerce.orders WHERE project_id=${q(project)} AND owner_id=${q(owner)})=1`,'duplicate Order')}
${check(`(SELECT version FROM local_commerce.carts WHERE project_id=${q(project)} AND id=${q(cart)})=1`,'Cart version changed')}
${check(`(SELECT quantity FROM local_commerce.cart_lines WHERE project_id=${q(project)} AND id=${q(line)})=2`,'Cart line changed')}
-- Read exact immutable item under original guest/capability; never current Catalog.
replay:=local_commerce.read_order_history(${q(project)},${q(marker)},'guest',${q(digest)},NULL,NULL,clock_timestamp()+interval '20 minutes',${q('b'.repeat(64))},(result#>>'{value,orderId}')::uuid,result#>>'{value,publicReference}',(SELECT id FROM local_commerce.order_items WHERE project_id=${q(project)} AND order_id=(result#>>'{value,orderId}')::uuid ORDER BY item_sequence LIMIT 1),'canonical_item');
${check(`replay->>'status'='found' AND replay#>'{value,purchasedItem,fulfillment,requiresProductionPreview}'=${j(physical)}`,'history policy missing')}
UPDATE local_commerce.catalog_products SET fulfillment_definition=jsonb_set(fulfillment_definition,'{requiresProductionPreview}',to_jsonb(NOT (fulfillment_definition->>'requiresProductionPreview')::boolean)), name='changed after purchase' WHERE project_id=${q(project)} AND id=${q(p.id)};
${check(`replay=local_commerce.read_order_history(${q(project)},${q(marker)},'guest',${q(digest)},NULL,NULL,clock_timestamp()+interval '20 minutes',${q('b'.repeat(64))},(result#>>'{value,orderId}')::uuid,result#>>'{value,publicReference}',(replay#>>'{value,orderItemId}')::uuid,'canonical_item')`,'Catalog drift rewrote history')}
${check(`(local_commerce.read_order_history(${q(project)},${q(marker)},'guest',${q(digest)},NULL,NULL,clock_timestamp()+interval '20 minutes',${q('d'.repeat(64))},(result#>>'{value,orderId}')::uuid,result#>>'{value,publicReference}',(replay#>>'{value,orderItemId}')::uuid,'canonical_item'))->>'status'='unavailable'`,'wrong capability accepted')}
${check(`NOT has_function_privilege('authenticated','local_commerce.read_order_history(text,text,text,text,uuid,text,timestamptz,text,uuid,text,uuid,text)','EXECUTE')`,'history RPC privilege')}
RAISE NOTICE 'rollback-only preview/history policy preapply checks PASS';
END $checks$;
ROLLBACK;
DO $after$ BEGIN
${check(`(SELECT count(*) FROM local_commerce.migration_ledger)=${expectedSchema}`,'ledger changed')}
${check(`to_regclass('local_commerce.order_creation_bindings') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='preapply_exact_owner_failure')`,'existing state changed')}
${check(`EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='local_commerce' AND p.proname='read_order_history')`,'applied history RPC missing')}
END $after$;`;
const run=spawnSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:20000});
console.log(JSON.stringify({mode:appliedMode?'APPLIED FUNCTION / ROLLED-BACK FIXTURES':'LEGACY RECHECK / ALL FIXTURES ROLLED BACK',classification:mixed?'mixed':physical?'physical':'digital-only / email-only contact',exit:run.status,error:run.error?.code,stdout:run.stdout,stderr:run.stderr}));
process.exit(run.status??1);
