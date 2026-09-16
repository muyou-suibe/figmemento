import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fulfillmentReplaySql} from './database/local-commerce-fulfillment-replay-sql.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('local/commerce/migrations/0022_local-commerce-customer-preview-decisions.sql');
test('forward fix changes only read/prepare lock upgrade, not customer authority or mutations',()=>{
 const original=sql.slice(sql.indexOf('create function'),sql.indexOf('create or replace function')).trim();
 const candidate=read('local/commerce/migrations/0023_local-commerce-preview-read-lock.sql');
 const normalized=candidate.slice(candidate.indexOf('create or replace function')).trim()
  .replace('create or replace function','create function')
  .replace(" if p_operation in ('read','prepare') then\n   select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference;\n else\n   select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference for update;\n end if;"," select * into purchase from local_commerce.orders where project_id=p_project_id and public_reference=p_public_reference for update;");
 assert.equal(normalized,original);
});
test('operator replay returns stored result before new version/lifecycle validation',()=>{
 const operator=sql.slice(sql.indexOf('create or replace function'));
 assert.ok(operator.indexOf('previous.result')<operator.indexOf('aggregate.version<>p_expected_version'));
 assert.match(operator,/p_fulfillment_id,p_actor_kind,p_actor_id,kind,p_expected_version,p_input/);
 assert.match(operator,/'value',previous.result->'value','replayed',true/);
});
test('customer historical manifest context precedes current pointer eligibility',()=>{
 const customer=sql.slice(0,sql.indexOf('create or replace function'));
 assert.ok(customer.indexOf('read_order_history(')<customer.indexOf('select * into previous'));
 assert.ok(customer.indexOf('previous.result')<customer.indexOf('id=aggregate.current_manifest_id'));
 assert.match(customer,/manifest\.id,p_expected_preview_version,p_expected_aggregate_version,p_note/);
});
test('all accepted operator calls recheck existing independent authority',()=>{
 const media=read('app/server/local-persistent-preview-media.server.ts');
 assert.match(media,/const current=createLocalFulfillmentDevelopmentOperatorVerifier\(\)\.verify\(\)/);
 assert.ok(media.indexOf('current?.actorKind')<media.indexOf('adapter.callRestrictedRpc'));
 const admission=read('app/server/local-persistent-fulfillment.server.ts');
 assert.ok(admission.indexOf('createLocalFulfillmentDevelopmentOperatorVerifier().verify()')<admission.indexOf('await createLocalPersistentSupabaseAdapter'));
});
test('independent SQL gate covers reserve and ready rollback plus applied ACL/RLS',()=>{
 const checks=fulfillmentReplaySql();
 for(const contract of ['reserve no partial effects','ready no partial effects','original durable result',
  'changed normalized replay context conflict','one audit per admission/reserve/ready/publish','no PUBLIC/client execute','authenticated no CRUD'])assert.ok(checks.includes(contract));
 assert.match(checks,/array\['before','after'\]/);
});
