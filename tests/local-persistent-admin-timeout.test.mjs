import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePersistentAdminTimeout as parse} from '../app/application/local-persistent-admin-timeout-contract.server.ts';
import {handlePersistentAdminTimeout,projectAdminTimeout,persistentAdminTimeout} from '../app/server/local-persistent-admin-timeout.server.ts';
import {createSignedAdminSession} from '../app/application/admin-session.ts';
import {catalogTestEnvironment} from './fixtures/local-persistent-catalog.mjs';
const input={actionKind:'operator_timeout',fulfillmentActionId:'timeout_action_0001',expectedAggregateVersion:2,
 expectedPreviewVersion:1,manifestId:'11111111-1111-4111-8111-111111111111',reason:'Approved reason'};
test('independent Admin policy counts normalized UTF-16 units exactly',()=>{
 for(const reason of ['x'.repeat(500),'😀'.repeat(250),' \tmeaningful\n','a  b'])assert.ok(parse({...input,reason}));
 for(const reason of ['', ' \t\n','x'.repeat(501),'😀'.repeat(251),null,500])assert.equal(parse({...input,reason}),null);
 assert.equal(parse({...input,reason:' \uFEFFa  b\u00a0 '}).reason,'a  b');
 assert.equal(parse({...input,reason:'<b>text only</b>'}).reason,'<b>text only</b>');
});
test('Admin command requires selectors and rejects request-selected authority/time',()=>{
 for(const key of ['deadline','serverNow','duration','ownerId','customerId','source','approvalStatus'])assert.equal(parse({...input,[key]:1}),null);
 for(const key of ['expectedAggregateVersion','expectedPreviewVersion','manifestId','reason','fulfillmentActionId'])assert.equal(parse({...input,[key]:undefined}),null);
 for(const v of [0,-1,1.1,'1',null])assert.equal(parse({...input,expectedAggregateVersion:v}),null);
 for(const v of [0,4,'1',null])assert.equal(parse({...input,expectedPreviewVersion:v}),null);
 assert.equal(parse({...input,actionKind:'customer_approve'}),null);
});
test('signed Admin authentication precedes source and command processing',async()=>{
 for(const cookie of ['', 'photogift-admin-session=invalid','photogift-local-order=not-admin']){
  const r=await handlePersistentAdminTimeout(new Request('http://localhost/api/local-fulfillment/admin/x/timeout',{
   method:'POST',headers:{origin:'http://localhost',cookie,'content-type':'application/json'},body:JSON.stringify(input)}),'x');
  assert.equal(r.status,401);assert.deepEqual(await r.json(),{status:'unauthorized'});
 }
});
test('safe timeout projection does not spread internal fields',()=>{
 const value={publicReference:'FM-LOCAL-1234567890ABCDEF',status:'preview_approved',version:3,revisionRequestsUsed:0,
  decisionKind:'operator_timeout',actorId:'configured-admin',manifestId:input.manifestId,manifestVersion:1,
  reason:input.reason,confirmedAt:'2026-09-14T00:00:00Z',approvalDeadlineAt:'2026-09-14T00:00:00Z'};
 const result=projectAdminTimeout({...value,secret:'private',ownerId:'internal'},value.publicReference);
 assert.ok(result);assert.equal(result.secret,undefined);assert.equal(result.ownerId,undefined);
 assert.equal(projectAdminTimeout({...value,decisionKind:'customer_approve'},value.publicReference),null);
});
test('signed Admin source-mode failures construct no provider or network fallback',async()=>{
 const previous=process.env.ADMIN_PASSWORD,fetch=globalThis.fetch;process.env.ADMIN_PASSWORD='isolated-test-password';
 globalThis.fetch=async()=>assert.fail('forbidden provider/network construction');
 try{
  const token=await createSignedAdminSession(process.env.ADMIN_PASSWORD);
  const request=new Request('http://localhost/api/local-fulfillment/admin/x/timeout',{method:'POST',headers:{origin:'http://localhost',cookie:'photogift-admin-session='+token}});
  const env=catalogTestEnvironment({ADMIN_ACCEPTANCE_SOURCE:'local_persistent',LOCAL_FULFILLMENT_SOURCE:'local_persistent',LOCAL_ORDER_SOURCE:'local_persistent',LOCAL_PAYMENT_SOURCE:'local_persistent',CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent'});
  for(const patch of [{ADMIN_ACCEPTANCE_SOURCE:undefined},{ADMIN_ACCEPTANCE_SOURCE:'local_fake'},{ADMIN_ACCEPTANCE_SOURCE:'wrong'},
   {NODE_ENV:'production'},{NODE_ENV:'staging'},{NODE_ENV:'unknown'},
   {LOCAL_FULFILLMENT_SOURCE:'local_fake'},{LOCAL_COMMERCE_MARKER_DIGEST:'wrong'},
   {LOCAL_COMMERCE_API_URL:'https://example.invalid'},{LOCAL_COMMERCE_PROJECT_ID:'wrong-project'}])
   assert.equal((await persistentAdminTimeout(request,'FM-LOCAL-1234567890ABCDEF',input,{...env,...patch})).status,'unavailable');
 }finally{globalThis.fetch=fetch;if(previous===undefined)delete process.env.ADMIN_PASSWORD;else process.env.ADMIN_PASSWORD=previous;}
});
test('deadline and replay SQL preserve upstream and distinct timeout authority',()=>{
 const sql=readFileSync('local/commerce/migrations/0025_local-commerce-admin-timeout.sql','utf8');
 assert.match(sql,/interval '259200 seconds'/);assert.match(sql,/immutable preview deadline/);
 assert.match(sql,/stamp<manifest.approval_deadline_at/);
 assert.ok(sql.indexOf("previous.result->'value'")<sql.indexOf("purchase.lifecycle_status<>'paid'"));
 assert.match(sql,/p_actor_kind is distinct from 'admin'/);assert.match(sql,/units>500/);
 assert.doesNotMatch(sql,/update local_commerce\.(preview_manifests|orders|order_items|photo_reviews)|insert into local_commerce\.(shipments|shipment_events)/);
 assert.doesNotMatch(sql,/revision_requests_used\s*=|p_now|p_deadline/);
 assert.match(sql,/d.decision_kind='operator_timeout'/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
});
