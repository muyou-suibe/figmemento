import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateLocalOrderAmounts as allocate} from '../app/application/local-order-allocation.ts';

const line=(lineId,subtotalCents,requiresShipping=true,discountEligible=true)=>({lineId,subtotalCents,requiresShipping,discountEligible});
const sum=(xs,key)=>xs.reduce((a,x)=>a+x[key],0);
function conservation(input){
  const r=allocate(input);assert.equal(r.status,'found');const v=r.value;
  for(const key of ['subtotalCents','discountCents','shippingCents','localArithmeticTotalCents'])assert.equal(sum(v.lines,key),v[key]);
  assert.equal(v.localArithmeticTotalCents,v.subtotalCents+v.shippingCents-v.discountCents);
  for(const l of [v,...v.lines])assert.deepEqual(l.tax,{status:'not_activated',amount:null});
  for(const l of v.lines){if(!l.requiresShipping)assert.equal(l.shippingCents,0);if(!l.discountEligible)assert.equal(l.discountCents,0);assert.ok(l.localArithmeticTotalCents>=0);}
  assert.deepEqual(allocate(input),r);return v;
}
test('ties use stable canonical line order, not lexicographic identity',()=>{
  const v=conservation({lines:[line('z',100),line('a',100),line('m',100)],discountCents:2,shippingCents:2});
  assert.deepEqual(v.lines.map(l=>l.discountCents),[1,1,0]);assert.deepEqual(v.lines.map(l=>l.shippingCents),[1,1,0]);
});
test('mixed purchase allocates shipping only to physical lines',()=>{
  const v=conservation({lines:[line('digital',900,false),line('physical-a',100),line('physical-b',200)],discountCents:101,shippingCents:7});
  assert.deepEqual(v.lines.map(l=>l.shippingCents),[0,2,5]);
});
test('zero physical weights split equally while digital shipping remains zero',()=>{
  const v=conservation({lines:[line('a',0),line('d',100,false),line('b',0)],discountCents:0,shippingCents:3});
  assert.deepEqual(v.lines.map(l=>l.shippingCents),[2,0,1]);
});
test('digital-only purchase has no shipping or numeric tax',()=>{
  conservation({lines:[line('digital',101,false)],discountCents:1,shippingCents:0});
  assert.equal(allocate({lines:[line('digital',101,false)],discountCents:0,shippingCents:1}).status,'unavailable');
});
test('discount never crosses eligibility or exceeds eligible subtotal',()=>{
  const lines=[line('a',10,true,false),line('b',3)];
  assert.deepEqual(conservation({lines,discountCents:3,shippingCents:0}).lines.map(l=>l.discountCents),[0,3]);
  assert.equal(allocate({lines,discountCents:4,shippingCents:0}).status,'unavailable');
});
test('large multiplication remains exact without floating point intermediate loss',()=>{
  const v=conservation({lines:[line('a',1000000000),line('b',1000000000)],discountCents:1999999999,shippingCents:0});
  assert.deepEqual(v.lines.map(l=>l.discountCents),[1000000000,999999999]);
});
test('invalid amounts, duplicate IDs and overflow fail closed without throwing',()=>{
  for(const n of [-1,0.1,NaN,Infinity,'1',null,2147483648,Number.MAX_SAFE_INTEGER+1]){
    assert.equal(allocate({lines:[line('a',1)],discountCents:n,shippingCents:0}).status,'unavailable');
    assert.equal(allocate({lines:[line('a',n)],discountCents:0,shippingCents:0}).status,'unavailable');
  }
  for(const lines of [[],[line('a',1),line('a',1)],[line('a',Number.MAX_SAFE_INTEGER),line('b',1)]])
    assert.equal(allocate({lines,discountCents:0,shippingCents:0}).status,'unavailable');
  assert.equal(allocate({lines:[line('a',Number.MAX_SAFE_INTEGER)],discountCents:0,shippingCents:1}).status,'unavailable');
});
test('deterministic matrix conserves every minor unit and does not mutate input',()=>{
  for(let count=1;count<=20;count++)for(let amount=0;amount<=100;amount++){
    const lines=Array.from({length:count},(_,i)=>line('line-'+i,(i+1)*17,i%3!==1));
    const input={lines,discountCents:Math.min(amount,sum(lines,'subtotalCents')),shippingCents:amount};
    const before=structuredClone(input);conservation(input);assert.deepEqual(input,before);
  }
});
