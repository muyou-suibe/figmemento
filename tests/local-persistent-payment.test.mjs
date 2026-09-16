import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseLocalPaymentMutationInput} from '../app/domain/local-payment.ts';
import {projectPersistentPayment,executePersistentPayment} from '../app/server/local-persistent-payment.server.ts';
const input={publicReference:'FM-LOCAL-ABCDEFGHIJKLMNOP',paymentAttemptId:'opaque-attempt',outcome:'success'};
const sql=readFileSync(new URL('../local/commerce/migrations/0018_local-commerce-payment-command.sql',import.meta.url),'utf8');
for(const outcome of ['success','failed','cancelled'])test(`bounded ${outcome} public projection`,()=>{
 const payment={kind:'local_payment_projection',paymentReference:'LP-LOCAL-ABCDEFGHIJKLMNOP',orderReference:input.publicReference,
  outcome,status:outcome==='success'?'succeeded':outcome,simulatedAmountCents:123,currency:'private-extra',simulatedCurrency:'USD',timestamp:'2026-09-13T00:00:00Z',
  notice:'Development/test simulation only. No real money was charged.',ownerId:'private',sessionHash:'private'};
 const projected=projectPersistentPayment({replayed:true,payment,ownerId:'private'}, {...input,outcome});
 assert.equal(projected.payment.simulatedAmountCents,123);assert.equal(projected.replayed,true);
 assert.doesNotMatch(JSON.stringify(projected),/ownerId|sessionHash|private/);
 for(const patch of [{simulatedAmountCents:-1},{simulatedAmountCents:1.2},{simulatedCurrency:'EUR'},{timestamp:'bad'},{outcome:'invented'},{notice:'Real money charged'}])assert.equal(projectPersistentPayment({replayed:false,payment:{...payment,...patch}}, {...input,outcome}),null);
});
for(const field of ['amount','currency','total','discountAmount','ownerId','customerId','targetStatus','paymentStatus','providerToken'])test(`browser ${field} rejected`,()=>{
 assert.equal(parseLocalPaymentMutationInput({...input,[field]:'forged'}).ok,false);
});
test('single canonical transaction, auth then replay then new lifecycle',()=>{
 assert.ok(sql.indexOf('history:=local_commerce.read_order_history')<sql.indexOf('select * into action'));
 assert.ok(sql.indexOf('select * into action')<sql.indexOf("purchase.lifecycle_status not in"));
 assert.match(sql,/purchase.version<>p_expected_version/);assert.match(sql,/for update/);
 assert.match(sql,/header.total_cents/);assert.match(sql,/header.tax_amount_cents is not null/);
 assert.doesNotMatch(sql,/create table|update local_commerce\.(?:order_purchase_snapshots|order_item_purchase_snapshots|cart|media)|insert into local_commerce\.(?:fulfillments|shipments|digital|notification)/i);
 assert.match(sql,/exception[\s\S]*unique_violation[\s\S]*when others/);
});
test('restricted signature and fixed search path',()=>{
 assert.match(sql,/set search_path=pg_catalog,local_commerce/);
 assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/^\s*(?:begin|commit|rollback)\s*;/mi);
});
test('forbidden modes fail before any network or fallback',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw Error('forbidden');};
 try{for(const NODE_ENV of ['production','staging','unknown'])assert.equal((await executePersistentPayment(new Request('http://localhost'),input,{NODE_ENV,LOCAL_PAYMENT_SOURCE:'local_persistent'})).status,'unavailable');assert.equal(calls,0);}finally{globalThis.fetch=old;}
});
