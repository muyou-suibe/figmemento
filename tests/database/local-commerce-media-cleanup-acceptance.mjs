import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {cleanupPersistentMedia} from '../../app/infrastructure/local-commerce/local-persistent-media-cleanup.server.ts';

// Called only by the marker/ledger-verified exact disposable-run harness.
// All operation selectors below are created during THIS invocation. No scans,
// historical-run reset, public seed endpoint or Task 6 command is involved.
export async function verifyMediaCleanup(x) {
 const {env,c,prep,sql,headers,info,media,args,readDraft,save,check,report,nativeFetch}=x;
 assert.equal(c.projectId,'figmemento-local-commerce-test-run-75224a5b');
 assert.equal(sql(`select local_commerce.verify_project_identity('${c.projectId}','${prep.markerDigest}');`),'t');
 const row=id=>JSON.parse(sql(`select row_to_json(o) from local_commerce.media_operations o where project_id='${c.projectId}' and id='${id}';`));
 const create=async()=>{const r=await media.accept(args());assert.equal(r.status,'found');return r;};
 const object=async(o,resource)=>nativeFetch(c.endpoints.storageUrl+'/object/authenticated/local-commerce-private/'+o[resource+'_locator'],{headers});
 const rpc=async(id,resource,command='claim',lease=null,patch={})=>{
  const r=await nativeFetch(c.endpoints.apiUrl+'/rest/v1/rpc/media_cleanup_command',{method:'POST',headers,body:JSON.stringify({p_project_id:c.projectId,p_marker_digest:prep.markerDigest,p_operation_id:id,p_resource:resource,p_command:command,p_lease_token:lease,...patch})});
  assert.equal(r.status,200);return r.json();
 };
 const dead=async(r)=>{assert.equal((await media.remove(r.operationId)).status,'removed');assert.equal((await media.read(r.receipt.receiptId)).status,'unavailable');};
 const safeDelete=async(r,resource)=>{assert.equal((await cleanupPersistentMedia(env,r.operationId,resource)).status,'completed');assert.notEqual((await object(row(r.operationId),resource)).status,200);};
 const leaseRow=id=>JSON.parse(sql(`select row_to_json(j) from local_commerce.media_cleanup_leases j where project_id='${c.projectId}' and operation_id='${id}' and internal_locator=(select derivative_locator from local_commerce.media_operations where project_id='${c.projectId}' and id='${id}');`));
 report.cleanup={deletionScope:'exact newly-created synthetic operation resource selected by marker-verified durable cleanup authority',checks:[]};
 await check('5.6 expiry denies receipt before exact physical cleanup',async()=>{
  const r=await create();const o=row(r.operationId);
  sql(`update local_commerce.media_receipts set expires_at=clock_timestamp()-interval '1 second' where project_id='${c.projectId}' and id='${o.receipt_id}';`);
  assert.equal((await media.read(r.receipt.receiptId)).status,'unavailable');assert.equal((await object(o,'derivative')).status,200);
  await safeDelete(r,'derivative');await safeDelete(r,'original');
  assert.equal((await media.reconcile(r.operationId)).status,'unavailable');
  report.cleanup.expiry=true;
 });
 await check('5.6 two independent workers compete: one exact DELETE, durable completion replay',async()=>{
  const r=await create();await dead(r);
  const program=`import{readFileSync}from'node:fs';import{cleanupPersistentMedia}from'./app/infrastructure/local-commerce/local-persistent-media-cleanup.server.ts';const x=JSON.parse(readFileSync(0,'utf8'));let deletes=0;const f=globalThis.fetch;globalThis.fetch=async(u,o)=>{if(o?.method==='DELETE'){deletes++;const b=JSON.parse(o.body);if(b.prefixes.length!==1)throw Error('unbounded delete');}return f(u,o);};const result=await cleanupPersistentMedia(x.env,x.id,'derivative');console.log(JSON.stringify({pid:process.pid,deletes,result}));`;
  const worker=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',program],{stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.stderr.resume();p.on('error',reject);p.on('exit',code=>{if(code!==0)return reject(Error('cleanup worker failed'));try{resolve(JSON.parse(out));}catch{reject(Error('invalid worker output'));}});p.stdin.end(JSON.stringify({env,id:r.operationId}));});
  const results=await Promise.all([worker(),worker()]);assert.notEqual(results[0].pid,results[1].pid);assert.ok(results.every(v=>v.pid!==process.pid));
  assert.equal(results.reduce((n,v)=>n+v.deletes,0),1);assert.ok(results.every(v=>['completed','conflict'].includes(v.result.status)));
  assert.equal(leaseRow(r.operationId).lifecycle,'completed');await safeDelete(r,'derivative');await safeDelete(r,'original');
  report.cleanup.workers=results;
 });
 await check('5.6 server bounded durable lease: abandonment, expiry, fenced retry',async()=>{
  const r=await create();await dead(r);const claimed=await rpc(r.operationId,'derivative');assert.equal(claimed.status,'leased');
  const j=leaseRow(r.operationId);assert.equal(Date.parse(j.expires_at)-Date.parse(j.acquired_at),60000);assert.equal(j.lease_token,claimed.leaseToken);
  assert.equal((await cleanupPersistentMedia(env,r.operationId,'derivative')).status,'conflict');assert.equal((await object(row(r.operationId),'derivative')).status,200);
  // Controlled server fixture clock boundary; production code still uses DB time.
  sql(`update local_commerce.media_cleanup_leases set acquired_at=statement_timestamp()-interval '61 seconds',expires_at=statement_timestamp()-interval '1 second' where project_id='${c.projectId}' and id='${j.id}';`);
  assert.equal((await rpc(r.operationId,'derivative','check',claimed.leaseToken)).status,'conflict');await safeDelete(r,'derivative');
  const next=leaseRow(r.operationId);assert.equal(next.attempts,2);assert.notEqual(next.lease_token,j.lease_token);await safeDelete(r,'original');
  report.cleanup.lease={durationSeconds:60,expiredTokenRejected:true,attempts:next.attempts};
 });
 await check('5.6 actual Storage DELETE denial: failed lease, no eligibility revival, retry succeeds',async()=>{
  const r=await create();await dead(r);let denial;
  globalThis.fetch=async(u,o)=>{if(o?.method==='DELETE'){const h=new Headers(o.headers);h.set('authorization','Bearer '+info.ANON_KEY);const response=await nativeFetch(u,{...o,headers:h});denial=response.status;const body=await response.clone().json();console.log(JSON.stringify({storageDeleteStatus:denial,responseKind:Array.isArray(body)?'array':typeof body,deletedCount:Array.isArray(body)?body.length:null}));return response;}return nativeFetch(u,o);};
  try{assert.equal((await cleanupPersistentMedia(env,r.operationId,'derivative')).status,'unavailable');}finally{globalThis.fetch=nativeFetch;}
  // Local Storage expresses RLS denial as HTTP 200 with zero deleted objects.
  // The adapter must still reject completion and the exact bytes must remain.
  assert.ok([200,400,401,403].includes(denial));assert.equal(leaseRow(r.operationId).lifecycle,'failed');assert.equal((await media.read(r.receipt.receiptId)).status,'unavailable');
  assert.equal((await object(row(r.operationId),'derivative')).status,200);await safeDelete(r,'derivative');await safeDelete(r,'original');
  report.cleanup.failure={httpStatus:denial,retry:true,eligibilityRestored:false};
 });
 await check('5.6 shared original retained until last live authorization removed',async()=>{
  const first=await create();await save(first);const crop={x:0,y:0,width:0.5,height:0.5};
  const second=await media.accept({...args(),slotId:first.slotId,originalReceiptId:first.receipt.receiptId,crop});assert.equal(second.status,'found');
  assert.equal(row(first.operationId).original_locator,row(second.operationId).original_locator);
  await dead(first);await safeDelete(first,'derivative');assert.equal((await cleanupPersistentMedia(env,first.operationId,'original')).status,'retained');
  assert.equal((await media.read(second.receipt.receiptId)).status,'found');assert.equal((await object(row(first.operationId),'original')).status,200);
  await dead(second);await safeDelete(second,'derivative');await safeDelete(second,'original');report.cleanup.sharedOriginal=true;
 });
 await check('5.6 synthetic committed Order/item binding retains both resources after removal/expiry',async()=>{
  const r=await create();const o=row(r.operationId);const order=randomUUID(),item=randomUUID();
  // Private retention fixture ONLY: no canonical Order API, payment or attach command.
  sql(`begin; insert into local_commerce.orders(project_id,id,owner_id,public_reference) values('${c.projectId}','${order}','${o.owner_id}','FM-SYNTHETIC-${randomUUID().toUpperCase()}');
   insert into local_commerce.order_items(project_id,id,order_id,owner_id,item_sequence) values('${c.projectId}','${item}','${order}','${o.owner_id}',0);
   insert into local_commerce.order_item_receipt_bindings(project_id,order_item_id,receipt_id,owner_id) values('${c.projectId}','${item}','${o.receipt_id}','${o.owner_id}'); commit;`);
  await dead(r);sql(`update local_commerce.media_receipts set expires_at=clock_timestamp()-interval '1 second' where project_id='${c.projectId}' and id='${o.receipt_id}';`);
  for(const resource of ['original','derivative']){assert.equal((await cleanupPersistentMedia(env,r.operationId,resource)).status,'retained');assert.equal((await object(o,resource)).status,200);}
  assert.equal(sql(`select count(*) from local_commerce.media_cleanup_leases where project_id='${c.projectId}' and operation_id='${r.operationId}';`),'0');
  report.cleanup.orderRetention={syntheticFixtureOnly:true,original:true,derivative:true};
 });
 await check('5.6 late unselected operation cleanup never changes current confirmed Draft',async()=>{
  const before=await readDraft();let op;
  globalThis.fetch=async(u,o)=>{if(String(u).endsWith('/rpc/media_operation_command')&&JSON.parse(o.body).p_command==='publish'){op=JSON.parse(o.body).p_operation_id;return nativeFetch(u,{...o,body:JSON.stringify({...JSON.parse(o.body),p_marker_digest:'0'.repeat(64)})});}return nativeFetch(u,o);};
  try{assert.equal((await media.accept(args())).status,'unavailable');}finally{globalThis.fetch=nativeFetch;}
  assert.ok(op);assert.equal((await media.fail(op)).status,'failed');assert.equal((await media.reconcile(op)).status,'unavailable');assert.deepEqual(await readDraft(),before);
  for(const resource of ['original','derivative'])assert.notEqual((await object(row(op),resource)).status,200);report.cleanup.late=true;
 });
 await check('5.6 wrong project marker operation or locator cannot issue DELETE',async()=>{
  const r=await create();await dead(r);let deletes=0;
  globalThis.fetch=async(u,o)=>{if(o?.method==='DELETE')deletes++;return nativeFetch(u,o);};
  try{
   for(const patch of [{LOCAL_COMMERCE_PROJECT_ID:'figmemento-local-commerce-test-run-00000000'},{LOCAL_COMMERCE_MARKER_DIGEST:'0'.repeat(64)}])assert.equal((await cleanupPersistentMedia({...env,...patch},r.operationId,'original')).status,'unavailable');
   assert.equal((await cleanupPersistentMedia(env,randomUUID(),'original')).status,'unavailable');
   assert.equal((await cleanupPersistentMedia(env,r.operationId,'../../unknown')).status,'unavailable');assert.equal(deletes,0);
  }finally{globalThis.fetch=nativeFetch;}
  assert.equal((await object(row(r.operationId),'original')).status,200);await safeDelete(r,'original');await safeDelete(r,'derivative');report.cleanup.invalidSelectors=true;
 });
}
