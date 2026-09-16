import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPersistentPurchaseCart } from '../app/application/persistent-purchase-owner.server.ts';

const guest = {owner:{kind:'guest',projectId:'project-local',ownerId:'guest-owner',expiresAt:2000000000},expiresAt:2000000000};
const member = {owner:{kind:'customer',projectId:'project-local',ownerId:'member-owner',customerId:'customer-subject'},expiresAt:2000000000};
const found = {status:'found',value:{cartId:'exact-server-cart',version:3}};
const missing = {status:'unavailable',reason:'not_found'};

test('a found guest Cart preserves guest purchase owner without probing incidental membership',async()=>{
  let probes=0;
  const result=await selectPersistentPurchaseCart({verifyInitialOwner:async()=>guest,
    verifyCustomerOwner:async()=>{probes++;return member;},readExact:async owner=>{assert.equal(owner,guest);return found;}});
  assert.equal(result.status,'found');assert.equal(result.selected,guest);assert.equal(probes,0);
  assert.equal('customerId' in result.selected.owner,false);
});
test('exact guest not_found may select only the verified customer-owned Cart',async()=>{
  const reads=[];
  const result=await selectPersistentPurchaseCart({verifyInitialOwner:async()=>guest,verifyCustomerOwner:async()=>member,
    readExact:async owner=>{reads.push(owner);return owner===guest?missing:found;}});
  assert.equal(result.selected,member);assert.deepEqual(reads,[guest,member]);
});
test('without guest context the verified member Cart retains member ownership',async()=>{
  const result=await selectPersistentPurchaseCart({verifyInitialOwner:async()=>member,
    verifyCustomerOwner:async()=>{assert.fail('no secondary owner selection');},readExact:async()=>found});
  assert.equal(result.selected,member);
});
test('missing, expired, invalid or unverifiable initial authority cannot be replaced with membership',async()=>{
  for(const verifyInitialOwner of [async()=>null,async()=>{throw Error('unavailable');}]){
    const result=await selectPersistentPurchaseCart({verifyInitialOwner,
      verifyCustomerOwner:async()=>{assert.fail('must not claim guest Cart');},readExact:async()=>{assert.fail('no read without authority');}});
    assert.equal(result.status,'unavailable');
  }
});
test('guest source failure or conflict cannot become a member fallback',async()=>{
  for(const failure of [{status:'unavailable',reason:'source_failure'},{status:'conflict',reason:'ownership_mismatch'}]){
    const result=await selectPersistentPurchaseCart({verifyInitialOwner:async()=>guest,
      verifyCustomerOwner:async()=>{assert.fail('not a not_found result');},readExact:async()=>failure});
    assert.equal(result.status,'unavailable');
  }
});
test('foreign-project and guest identities cannot satisfy the member probe',async()=>{
  for(const other of [guest,{...member,owner:{...member.owner,projectId:'other-project'}},null]){
    let reads=0;
    const result=await selectPersistentPurchaseCart({verifyInitialOwner:async()=>guest,verifyCustomerOwner:async()=>other,
      readExact:async()=>{reads++;return missing;}});
    assert.equal(result.status,'unavailable');assert.equal(reads,1);
  }
});
test('membership alone cannot recover an exact guest Cart absent under customer ownership',async()=>{
  const result=await selectPersistentPurchaseCart({verifyInitialOwner:async()=>member,
    verifyCustomerOwner:async()=>{assert.fail('no claim path');},readExact:async()=>missing});
  assert.equal(result.status,'unavailable');
});
