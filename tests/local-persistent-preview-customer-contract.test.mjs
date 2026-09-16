import assert from 'node:assert/strict';
import test from 'node:test';
import {parsePersistentPreviewCustomerAction as parse} from '../app/application/local-persistent-preview-customer-contract.server.ts';
import {LOCAL_FULFILLMENT_REVISION_NOTE_MAX_LENGTH,parseLocalFulfillmentActionInput} from '../app/domain/local-fulfillment.ts';
const reference='FM-LOCAL-0000000000000000';
const action={fulfillmentActionId:'customer_revision_73',actionKind:'request_revision',expectedPreviewVersion:1};
test('persistent revision reuses exactly the established 500 UTF-16 bound',()=>{
 assert.equal(LOCAL_FULFILLMENT_REVISION_NOTE_MAX_LENGTH,500);
 for(const [revisionNote,ok] of [['x'.repeat(500),true],['x'.repeat(501),false],['😀'.repeat(250),true],['😀'.repeat(251),false]]){
  assert.equal(parseLocalFulfillmentActionInput({...action,publicOrderReference:reference,revisionNote}).ok,ok);
  assert.equal(parse({...action,revisionNote,expectedAggregateVersion:2},reference).ok,ok);
 }
});
test('persistent requires a meaningful note without changing local_fake optional semantics',()=>{
 assert.equal(parseLocalFulfillmentActionInput({...action,publicOrderReference:reference}).ok,true);
 for(const revisionNote of [undefined,'',' \n\t','\u00a0\ufeff'])assert.equal(parse({...action,expectedAggregateVersion:2,revisionNote},reference).ok,false);
 const result=parse({...action,expectedAggregateVersion:2,revisionNote:' \u00a0adjust lighting\ufeff '},reference);
 assert.equal(result.ok,true);assert.equal(result.value.revisionNote,'adjust lighting');
});
test('customer selectors never admit operator, lifecycle or owner authority',()=>{
 for(const patch of [{actionKind:'publish_preview'},{actionKind:'start_production'},{ownerId:'forged'},{approved:true},{manifestVersion:2},{expectedPreviewVersion:undefined},{expectedPreviewVersion:4}])
 assert.equal(parse({...action,expectedAggregateVersion:2,revisionNote:'adjust',...patch},reference).ok,false);
 assert.equal(parse({...action,expectedAggregateVersion:2,actionKind:'approve_preview'},reference).ok,true);
});
test('aggregate CAS is mandatory and retained without server-version substitution',()=>{
 for(const expectedAggregateVersion of [undefined,null,0,-1,1.5,'2'])
  assert.equal(parse({...action,revisionNote:'adjust',expectedAggregateVersion},reference).ok,false);
 for(const expectedAggregateVersion of [2,3]){
  const result=parse({...action,revisionNote:' adjust ',expectedAggregateVersion},reference);
  assert.equal(result.ok,true);assert.equal(result.value.expectedAggregateVersion,expectedAggregateVersion);
 }
});
