import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePersistentPhotoReviewDecision as parse} from '../app/server/local-persistent-photo-review-decision.server.ts';

const action={fulfillmentActionId:'photo_review_action_0001',actionKind:'approve_photo_review',
 orderItemId:'10000000-0000-4000-8000-000000000001',expectedAggregateVersion:1};

test('photo review parser accepts only explicit item-scoped approve/reject with mandatory CAS',()=>{
 assert.deepEqual(parse(action),action);
 assert.equal(parse({...action,actionKind:'reject_photo_review'}).actionKind,'reject_photo_review');
 for(const value of [undefined,null,0,-1,1.1,'1'])assert.equal(parse({...action,expectedAggregateVersion:value}),null);
 for(const value of ['approve','customer_approve','pending','start_production'])assert.equal(parse({...action,actionKind:value}),null);
});

test('browser cannot provide review applicability, owner, media or authority facts',()=>{
 for(const key of ['ownerId','projectId','reviewState','media','receiptId','paid','actorId','note'])
  assert.equal(parse({...action,[key]:'forged'}),null);
 assert.equal(parse({...action,orderItemId:'not-a-uuid'}),null);
});

test('real review command uses canonical purchased media, pending row and replay-first atomic decision',()=>{
 const sql=readFileSync('local/commerce/migrations/0026_local-commerce-photo-review-decisions.sql','utf8');
 assert.ok(sql.indexOf("previous.result->'value'")<sql.indexOf("purchase.lifecycle_status<>'paid'"));
 assert.match(sql,/fulfillment_purchased_items/);
 assert.match(sql,/jsonb_array_length\(item#>'\{purchasedItem,media\}'\)=0/);
 assert.match(sql,/order_item_receipt_bindings/);
 assert.match(sql,/review\.review_state<>'pending'/);
 assert.match(sql,/update local_commerce\.photo_reviews set review_state=/);
 assert.match(sql,/update local_commerce\.fulfillments set version=version\+1/);
 assert.doesNotMatch(sql,/insert into local_commerce\.(photo_reviews|preview_manifests|shipments|shipment_events)/);
});

test('operator HTTP dispatch reuses the unified port and does not alter customer or fake actions',()=>{
 const server=readFileSync('app/server/local-persistent-photo-review-decision.server.ts','utf8');
 const http=readFileSync('app/server/local-fulfillment-operator-http.server.ts','utf8');
 assert.match(server,/LocalCommerceFulfillmentPort/);
 assert.match(server,/createLocalFulfillmentDevelopmentOperatorVerifier\(\)\.verify\(\)/);
 assert.match(server,/command\.expectedVersion !== action\.expectedAggregateVersion/);
 assert.match(server,/idempotency:\{key,fingerprint\}/);
 assert.match(http,/parsePersistentPhotoReviewDecision/);
 assert.match(http,/persistentPhotoReviewDecision/);
 assert.doesNotMatch(server,/customer capability|customer-session|Admin/i);
});
