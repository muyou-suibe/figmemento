import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePersistentLifecycleAction} from '../app/server/local-persistent-fulfillment-lifecycle.server.ts';
const input={fulfillmentActionId:'synthetic_action_0001',actionKind:'start_production',expectedAggregateVersion:1};
test('persistent lifecycle permits only production/quality with mandatory exact CAS',()=>{
 assert.deepEqual(parsePersistentLifecycleAction(input),input);
 assert.equal(parsePersistentLifecycleAction({...input,actionKind:'mark_quality_check'}).actionKind,'mark_quality_check');
 for(const expectedAggregateVersion of [undefined,null,0,-1,1.1,'1'])assert.equal(parsePersistentLifecycleAction({...input,expectedAggregateVersion}),null);
 for(const actionKind of ['shipped','delivered','approve_preview','operator_timeout'])assert.equal(parsePersistentLifecycleAction({...input,actionKind}),null);
});
test('browser cannot provide owner, price, manifest approval or review facts',()=>{
 for(const key of ['ownerId','price','manifestId','photoReview','approved','customerId'])assert.equal(parsePersistentLifecycleAction({...input,[key]:true}),null);
});
test('production RPC preserves replay-first and purchased review/preview gates',()=>{
 const sql=readFileSync('local/commerce/migrations/0024_local-commerce-production-quality.sql','utf8');
 assert.ok(sql.indexOf("previous.result->'value'")<sql.indexOf("purchase.lifecycle_status<>'paid'"));
 assert.match(sql,/fulfillment_purchased_items/);assert.match(sql,/review_state='approved'/);
 assert.match(sql,/d\.result#>>'\{value,manifestId\}'=manifest\.id::text/);
 assert.match(sql,/jsonb_array_length\(required\)=0 then 'photo_review' else 'preview_approved'/);
 assert.doesNotMatch(sql,/insert into local_commerce\.(shipments|shipment_events|photo_reviews)|update local_commerce\.(orders|photo_reviews)/);
});
test('persistent lifecycle remains on unified CAS port and independent operator verifier',()=>{
 const source=readFileSync('app/server/local-persistent-fulfillment-lifecycle.server.ts','utf8');
 assert.match(source,/LocalCommerceFulfillmentPort/);assert.match(source,/command.expectedVersion!==action.expectedAggregateVersion/);
 assert.match(source,/createLocalFulfillmentDevelopmentOperatorVerifier\(\).verify\(\)/);
 assert.match(source,/idempotency:\{key,fingerprint\}/);
});
