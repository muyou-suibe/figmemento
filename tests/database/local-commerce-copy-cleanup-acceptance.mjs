import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {fork, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cleanupPersistentMedia} from '../../app/infrastructure/local-commerce/local-persistent-media-cleanup.server.ts';
import {createLocalPersistentDraftPort} from '../../app/infrastructure/local-commerce/local-persistent-draft-adapter.server.ts';
import {createLocalPersistentMediaAuthority} from '../../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts';
import {persistentOwnerVerifier} from '../../app/server/local-persistent-purchase-authority.server.ts';

const acceptanceRun = process.env.LOCAL_COMMERCE_RUN_ID
 ?? process.argv.find(value => /^run-[a-f0-9]{8}$/.test(value))
 ?? 'run-5576dfd8';
const project = process.env.LOCAL_COMMERCE_PROJECT_ID ?? `figmemento-local-commerce-test-${acceptanceRun}`;
const container = process.env.TASK_11_4_VERIFIED_DB_CONTAINER_ID ?? '3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
const uuid = value => assert.match(value, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i);
const digest = value => createHash('sha256').update(value).digest('hex');
function query(sql) {
 const r = spawnSync('docker', ['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],
  {input:sql,encoding:'utf8',timeout:5000});
 assert.equal(r.status,0,`exact acceptance database command failed: ${(r.stderr??'').split('\n')[0]}`);return r.stdout.trim();
}
function operation(id) {
 uuid(id);
 return JSON.parse(query(`select row_to_json(o) from local_commerce.media_operations o where project_id='${project}' and id='${id}';`));
}

// Test-only safety observer: never supplies a locator to the cleanup authority.
// It independently rechecks current fixture provenance and the durable lease
// before forwarding the existing adapter's one-object DELETE request.
async function guardedCleanup(input) {
 const {env,id,resource,ownerId,createdAt,marker,api,locatorDigest}=input;
 uuid(id);uuid(ownerId);assert.match(marker,/^[a-f0-9]{64}$/);
 assert.ok(['original','derivative'].includes(resource));
 assert.equal(env.LOCAL_COMMERCE_PROJECT_ID,project);
 assert.equal(env.LOCAL_COMMERCE_RUN_ID,acceptanceRun);
 const nativeFetch=globalThis.fetch;const evidence={pid:process.pid,operationId:id,resource,locatorDigest,deletes:0,guards:0,deleteProof:null};
 globalThis.fetch=async(url,options)=>{
  if(options?.method==='DELETE') {
   if(input.beforeDelete)await input.beforeDelete();
   assert.equal(String(url),`${api}/storage/v1/object/local-commerce-private`);
   const body=JSON.parse(options.body);assert.equal(body.prefixes.length,1);
   assert.equal(query(`select local_commerce.verify_project_identity('${project}','${marker}');`),'t');
   const o=operation(id);assert.equal(o.owner_id,ownerId);assert.equal(o.created_at,createdAt);
   const locator=o[resource+'_locator'];assert.equal(digest(locator),locatorDigest);
   assert.equal(body.prefixes[0],locator);assert.ok(locator.startsWith(`${project}/media/`));
   // A locator is server-generated and immutable; none of these selectors
   // comes from a browser. SQL literals below only use this known exact row.
   assert.match(locator,/^[a-zA-Z0-9/_-]+$/);
   const safety=JSON.parse(query(`select json_build_object(
    'lease',(select count(*) from local_commerce.media_cleanup_leases where project_id='${project}' and operation_id='${id}' and internal_locator='${locator}' and lifecycle='leased' and expires_at>clock_timestamp()),
    'attachments',(select count(*) from local_commerce.order_item_receipt_bindings b join local_commerce.media_operations x on x.project_id=b.project_id and x.receipt_id=b.receipt_id where x.${resource}_locator='${locator}'),
    'foreign',(select count(*) from local_commerce.media_operations where ${resource}_locator='${locator}' and (project_id<>'${project}' or owner_id<>'${ownerId}')));`));
   assert.deepEqual(safety,{lease:1,attachments:0,foreign:0});evidence.guards++;
   console.info('EXACT SYNTHETIC DELETE GUARD PASS',JSON.stringify({operationId:id,resource,locatorDigest,lease:'active',attachments:0,foreign:0}));
   const response=await nativeFetch(url,options);evidence.deletes++;
   const result=await response.clone().json();
   evidence.deleteProof={status:response.status,exactName:Array.isArray(result)&&result.some(x=>x.name===locator)};
   return response;
  }
  return nativeFetch(url,options);
 };
 try {evidence.result=await cleanupPersistentMedia(env,id,resource);return evidence;}
 finally {globalThis.fetch=nativeFetch;}
}

// Both children wait at an IPC start barrier. The only exclusion mechanism is
// the real DB cleanup protocol, not a parent/process-memory lock.
if(process.argv.includes('--cleanup-worker')) {
 process.send({ready:true,pid:process.pid});
 process.once('message',async input=>{
  try {
   const result=input.mode==='copy' ? {pid:process.pid,result:await createLocalPersistentMediaAuthority(input.env,persistentOwnerVerifier(new Request('http://127.0.0.1/acceptance',{headers:{cookie:input.cookie}}),input.env)).copy(input.request)} : await guardedCleanup(input);
   process.send(result);process.disconnect();
  }
  catch {process.send({failure:'guarded cleanup failed',pid:process.pid});process.disconnect();process.exitCode=1;}
 });
}

export async function verifyCopyCleanup({env,c,prep,media,draft,bytes,field,productId,verifyOwner,memberVerifiers,wrongProductId,prepareAttach,guestCookie,task114Only=false,task115Only=false}) {
 assert.equal(c.projectId,project);const started=Date.now();
 const known=new Map(),report={scope:'new synthetic operations only',checks:[],deletions:[]};
 const remember=r=>{assert.equal(r.status,'found');const o=operation(r.operationId);assert.ok(Date.parse(o.created_at)>=started-1000);known.set(o.id,o);return r;};
 const createDraft=async()=>{const d=await draft.port.create({authority:draft.authority,expectedVersion:0,idempotency:{key:randomUUID(),fingerprint:'cleanup-copy-draft'},productId});assert.equal(d.status,'found');return d.value;};
 const fresh=async()=>{const d=await createDraft();const r=remember(await media.accept({draftId:d.draftId,expectedVersion:d.version,fieldId:field.id,bytes}));return {d,r};};
 const copy=async(source)=>{const d=await createDraft();const request={sourceReceiptId:source.receipt.receiptId,targetDraftId:d.draftId,expectedVersion:d.version,idempotencyKey:randomUUID()};return {d,request,r:remember(await media.copy(request))};};
 const input=(r,resource)=>{const o=known.get(r.operationId);assert.ok(o,'not a current fixture');return {env,id:o.id,resource,ownerId:o.owner_id,createdAt:o.created_at,marker:prep.markerDigest,api:c.endpoints.apiUrl,locatorDigest:digest(o[resource+'_locator'])};};
 const absent=async(r,resource)=>{
  const o=known.get(r.operationId);
  const response=await fetch(`${c.endpoints.storageUrl}/object/info/local-commerce-private/${o[resource+'_locator']}`,{headers:{authorization:`Bearer ${env.LOCAL_COMMERCE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(5000)});
  const body=await response.json();assert.equal(body.code,'NoSuchKey','trusted exact Storage metadata must prove absence');
  return {httpStatus:response.status,code:body.code};
 };
 const cleanup=async(r,resource,beforeDelete)=>{const e=await guardedCleanup({...input(r,resource),beforeDelete});assert.equal(e.result.status,'completed');e.absence=await absent(r,resource);report.deletions.push(e);return e;};
 const retire=async r=>{assert.equal((await media.remove(r.operationId)).status,'removed');assert.equal((await media.read(r.receipt.receiptId)).status,'unavailable');};
 const unavailable=async r=>{assert.equal((await media.read(r.receipt.receiptId)).status,'unavailable');assert.equal((await media.reconcile(r.operationId)).status,'unavailable');};

 // Source copy wins: the copy establishes its own durable live reference.
 const source=await fresh(),copied=await copy(source.r);
 assert.equal(known.get(source.r.operationId).original_locator,known.get(copied.r.operationId).original_locator);
 await retire(source.r);
 assert.equal((await guardedCleanup(input(source.r,'original'))).result.status,'retained');
 assert.equal((await media.read(copied.r.receipt.receiptId)).status,'found');
 report.checks.push('copy-first shared original retained');

 // A separate live source protects the original of a retired copied result.
 const liveSource=await fresh(),unusedCopy=await copy(liveSource.r);
 await retire(unusedCopy.r);await cleanup(unusedCopy.r,'derivative');await unavailable(unusedCopy.r);
 assert.equal((await guardedCleanup(input(unusedCopy.r,'original'))).result.status,'retained');
 assert.equal((await media.read(liveSource.r.receipt.receiptId)).status,'found');
 assert.deepEqual((await draft.port.read({authority:draft.authority,draftId:unusedCopy.d.draftId})).value,unusedCopy.d);
 report.checks.push('copied derivative absent; independent source remains authorized; no auto-confirm');

 // Cleanup wins, with neither a confirmed Draft nor any Order attachment.
 const retired=await fresh();await retire(retired.r);
 await cleanup(retired.r,'derivative');await cleanup(retired.r,'original');await unavailable(retired.r);
 const target=await createDraft();assert.equal((await media.copy({sourceReceiptId:retired.r.receipt.receiptId,targetDraftId:target.draftId,expectedVersion:target.version,idempotencyKey:randomUUID()})).status,'unavailable');
 assert.deepEqual((await draft.port.read({authority:draft.authority,draftId:retired.d.draftId})).value,retired.d);
 const o=known.get(retired.r.operationId);
 assert.equal(query(`select count(*) from local_commerce.order_item_receipt_bindings where project_id='${project}' and receipt_id='${o.receipt_id}';`),'0');
 report.checks.push('cleanup-first read/reconcile/copy unavailable; Draft unchanged; no attachment');
 if(task115Only) {
  const retryCase=await fresh();const retryOperation=known.get(retryCase.r.operationId);const retryOwner=await verifyOwner();
  assert.equal(retryOwner.owner.kind,'guest');
  const retired=await fetch(`${c.endpoints.apiUrl}/rest/v1/rpc/media_operation_command`,{method:'POST',headers:{apikey:env.LOCAL_COMMERCE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.LOCAL_COMMERCE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json','Content-Profile':'local_commerce'},body:JSON.stringify({p_project_id:project,p_marker_digest:prep.markerDigest,p_owner_kind:'guest',p_owner_selector:digest(retryOwner.owner.ownerId),p_customer_id:null,p_authority_expires_at:new Date(retryOwner.expiresAt*1000).toISOString(),p_command:'remove',p_operation_id:retryCase.r.operationId,p_draft_id:null,p_slot_id:null,p_expected_version:null,p_input:null}),signal:AbortSignal.timeout(5000)});
  assert.equal(retired.status,200);assert.equal((await retired.json()).status,'found');assert.equal((await media.read(retryCase.r.receipt.receiptId)).status,'unavailable');
  const beforeCleanup=await fetch(`${c.endpoints.storageUrl}/object/authenticated/local-commerce-private/${retryOperation.derivative_locator}`,{headers:{authorization:`Bearer ${env.LOCAL_COMMERCE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(5000)});
  assert.equal(beforeCleanup.status,200);await beforeCleanup.arrayBuffer();
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
   if(options?.method==='DELETE'&&String(url).includes('/storage/v1/object/')) {
    const headers=new Headers(options.headers);headers.set('authorization','Bearer invalid-task-11-5-credential');headers.set('apikey','invalid-task-11-5-credential');
    return nativeFetch(url,{...options,headers});
   }
   return nativeFetch(url,options);
  };
  let denied;
  try {denied=await guardedCleanup(input(retryCase.r,'derivative'));}
  finally {globalThis.fetch=nativeFetch;}
  assert.equal(denied.result.status,'unavailable');
  assert.equal(query(`select lifecycle from local_commerce.media_cleanup_leases where project_id='${project}' and operation_id='${retryCase.r.operationId}' and internal_locator=(select derivative_locator from local_commerce.media_operations where project_id='${project}' and id='${retryCase.r.operationId}');`),'failed');
  const retainedResponse=await fetch(`${c.endpoints.storageUrl}/object/authenticated/local-commerce-private/${known.get(retryCase.r.operationId).derivative_locator}`,{headers:{authorization:`Bearer ${env.LOCAL_COMMERCE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(5000)});
  assert.equal(retainedResponse.status,200);await retainedResponse.arrayBuffer();
  const retried=await cleanup(retryCase.r,'derivative');
  assert.equal(query(`select attempts from local_commerce.media_cleanup_leases where project_id='${project}' and operation_id='${retryCase.r.operationId}' and internal_locator=(select derivative_locator from local_commerce.media_operations where project_id='${project}' and id='${retryCase.r.operationId}');`),'2');
  report.cleanupRetry={operationId:retryCase.r.operationId,firstStatus:denied.result.status,leaseAfterFailure:'failed',bytesRetained:true,
   retryStatus:retried.result.status,attempts:2,absence:retried.absence};
  console.info('TASK 11.5 CLEANUP FAILURE RETRY PASS',JSON.stringify(report.cleanupRetry));
  return report;
 }
 if(task114Only) {
  console.info('TASK 11.4 H CLEANUP-FIRST PASS',JSON.stringify({checks:report.checks,deletions:report.deletions.map(item=>({operationId:item.operationId,resource:item.resource,deletes:item.deletes,status:item.result.status,absence:item.absence}))}));
  return report;
 }

 const raced=await fresh();await retire(raced.r);
 const children=[0,1].map(()=>fork(fileURLToPath(import.meta.url),['--cleanup-worker'],{stdio:['ignore','ignore','pipe','ipc']}));
 try {
  const readiness=await Promise.all(children.map(p=>new Promise((resolve,reject)=>{p.once('message',resolve);p.once('error',reject);p.stderr.resume();})));
  assert.ok(readiness.every(x=>x.ready));assert.notEqual(readiness[0].pid,readiness[1].pid);
  assert.ok(children.every(p=>p.exitCode===null));
  const outcomes=children.map(p=>new Promise((resolve,reject)=>{p.once('message',resolve);p.once('error',reject);}));
  for(const p of children)p.send(input(raced.r,'derivative'));
  const results=await Promise.all(outcomes);assert.ok(results.every(r=>!r.failure));
  assert.equal(results.reduce((n,r)=>n+r.deletes,0),1);
  assert.ok(results.every(r=>['completed','conflict'].includes(r.result.status)));
  const proof=await absent(raced.r,'derivative');
  assert.equal(query(`select lifecycle from local_commerce.media_cleanup_leases where project_id='${project}' and operation_id='${raced.r.operationId}';`),'completed');
  report.twoWorkers={pids:readiness.map(x=>x.pid),results,absence:proof};
 } finally {for(const p of children)if(p.connected)p.disconnect();}
 await unavailable(raced.r);
 // Actual independent process competition for a valid source. The cleanup
 // command must observe the live source/copy and must not issue any DELETE.
 const competition=await fresh(),competitionDraft=await createDraft();
 const competitors=[0,1].map(()=>fork(fileURLToPath(import.meta.url),['--cleanup-worker'],{stdio:['ignore','ignore','pipe','ipc']}));
 try {
  const ready=await Promise.all(competitors.map(p=>new Promise((resolve,reject)=>{p.once('message',resolve);p.once('error',reject);p.stderr.resume();})));
  assert.ok(ready.every(x=>x.ready));assert.notEqual(ready[0].pid,ready[1].pid);
  const results=competitors.map(p=>new Promise((resolve,reject)=>{p.once('message',resolve);p.once('error',reject);}));
  competitors[0].send({mode:'copy',env,cookie:guestCookie,request:{sourceReceiptId:competition.r.receipt.receiptId,targetDraftId:competitionDraft.draftId,expectedVersion:competitionDraft.version,idempotencyKey:randomUUID()}});
  competitors[1].send(input(competition.r,'original'));
  const [copiedResult,cleaned]=await Promise.all(results);remember(copiedResult.result);assert.equal(cleaned.result.status,'retained');assert.equal(cleaned.deletes,0);
  report.copyWorkers={pids:ready.map(x=>x.pid),copy:copiedResult.result.status,cleanup:cleaned.result.status,deletes:0};
 } finally {for(const p of competitors)if(p.connected)p.disconnect();}
 // Real Cart admission occurs while ready; normal explicit Draft removal
 // retires it before cleanup. Order POST must then reject without any writes.
 const attachLoser=await fresh();const attempt=await prepareAttach(attachLoser);
 const removal=await draft.port.save({authority:draft.authority,draftId:attachLoser.d.draftId,expectedVersion:attempt.version,idempotency:{key:randomUUID(),fingerprint:'synthetic-explicit-removal'},slots:[]});
 assert.equal(removal.status,'found');
 await cleanup(attachLoser.r,'derivative',attempt.reject);await unavailable(attachLoser.r);
 await attempt.reject();report.checks.push('real admitted Cart; normal Draft removal; cleanup wins; Order reject with zero new rows');

 const verified=await verifyOwner();assert.equal(verified.owner.kind,'guest');
 const late=await fetch(`${c.endpoints.apiUrl}/rest/v1/rpc/media_operation_command`,{method:'POST',headers:{apikey:env.LOCAL_COMMERCE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.LOCAL_COMMERCE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json','Content-Profile':'local_commerce'},body:JSON.stringify({p_project_id:project,p_marker_digest:prep.markerDigest,p_owner_kind:'guest',p_owner_selector:digest(verified.owner.ownerId),p_customer_id:null,p_authority_expires_at:new Date(verified.expiresAt*1000).toISOString(),p_command:'publish',p_operation_id:retired.r.operationId,p_draft_id:null,p_slot_id:null,p_expected_version:known.get(retired.r.operationId).version,p_input:null}),signal:AbortSignal.timeout(5000)});
 assert.equal(late.status,200);assert.equal((await late.json()).status,'unavailable');await absent(retired.r,'derivative');
 report.checks.push('post-delete real late-publish RPC rejected; no byte resurrection');

 const invalidTarget=await createDraft();
 const baseRequest={sourceReceiptId:liveSource.r.receipt.receiptId,targetDraftId:invalidTarget.draftId,expectedVersion:invalidTarget.version,idempotencyKey:randomUUID()};
 assert.equal((await media.copy({...baseRequest,sourceReceiptId:randomUUID()})).status,'unavailable');
 assert.equal((await media.copy({...baseRequest,expectedVersion:invalidTarget.version+1})).status,'conflict');
 assert.equal((await media.copy({...baseRequest,sourceReceiptId:source.r.receipt.receiptId})).status,'unavailable');
 const wrongProduct=await draft.port.create({authority:draft.authority,expectedVersion:0,idempotency:{key:randomUUID(),fingerprint:'wrong-product-target'},productId:wrongProductId});assert.equal(wrongProduct.status,'found');
 assert.equal((await media.copy({...baseRequest,targetDraftId:wrongProduct.value.draftId,expectedVersion:wrongProduct.value.version})).status,'unavailable');

 // A shorter server authority bound makes only this new receipt expire;
 // subsequent reads/copy use the still-valid original owner authority.
 const expiresAt=Math.floor(Date.now()/1000)+4;
 const expiring=createLocalPersistentMediaAuthority(env,async()=>({...await verifyOwner(),expiresAt}));
 const expiryDraft=await createDraft();const expiryResult=remember(await expiring.accept({draftId:expiryDraft.draftId,expectedVersion:expiryDraft.version,fieldId:field.id,bytes}));
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,expiresAt*1000-Date.now()+50)));
 assert.equal((await media.copy({...baseRequest,sourceReceiptId:expiryResult.receipt.receiptId})).status,'unavailable');
 report.checks.push('invalid/removed/expired receipt; stale Draft; wrong Product reject');

 const members=[];
 for(const verifier of memberVerifiers) {
  const port=await createLocalPersistentDraftPort({environment:env,verifyOwner:verifier});assert.equal(port.status,'ready');
  const d=await port.port.create({authority:port.authority,expectedVersion:0,idempotency:{key:randomUUID(),fingerprint:'member-copy'},productId});assert.equal(d.status,'found');
  members.push({port,d:d.value,media:createLocalPersistentMediaAuthority(env,verifier)});
 }
 const memberSource=remember(await members[0].media.accept({draftId:members[0].d.draftId,expectedVersion:members[0].d.version,fieldId:field.id,bytes}));
 const memberRequest={sourceReceiptId:memberSource.receipt.receiptId,targetDraftId:members[0].d.draftId,expectedVersion:members[0].d.version,idempotencyKey:randomUUID()};
 const memberCopy=remember(await members[0].media.copy(memberRequest));assert.deepEqual(await members[0].media.copy(memberRequest),memberCopy);
 assert.equal((await members[0].media.copy({...memberRequest,sourceReceiptId:liveSource.r.receipt.receiptId,idempotencyKey:randomUUID()})).status,'unavailable');
 assert.equal((await media.copy({...baseRequest,sourceReceiptId:memberSource.receipt.receiptId})).status,'unavailable');
 assert.equal((await members[1].media.copy({...memberRequest,targetDraftId:members[1].d.draftId,idempotencyKey:randomUUID()})).status,'unavailable');
 assert.equal((await members[1].media.read(memberCopy.receipt.receiptId)).status,'unavailable');
 report.checks.push('real session-derived member copy/replay; guest/member both directions and other member rejected');

 // Transaction-owned drift fixture. No COMMIT exists on this path. RPC sees
 // the private transaction's state; every exit (including SQL assertion,
 // process termination and timeout) rolls it back on connection close.
 uuid(productId);uuid(field.id);
 const configurationDigest=()=>query(`select md5(string_agg(row_to_json(c)::text,',' order by id)) from local_commerce.catalog_configuration_snapshots c where project_id='${project}' and product_id='${productId}';`);
 const beforeConfiguration=configurationDigest();
 for(const mode of ['inactive','revision']) {
  const mutation=mode==='inactive'
   ? `update local_commerce.catalog_configuration_snapshots set definition=jsonb_set(definition,'{fields,0,isActive}','false'::jsonb) where project_id='${project}' and product_id='${productId}';`
   : `update local_commerce.catalog_configuration_snapshots set configuration_status='inactive' where project_id='${project}' and product_id='${productId}';
      insert into local_commerce.catalog_configuration_snapshots(project_id,product_id,revision,definition,configuration_status)
      select project_id,product_id,revision+1,jsonb_set(jsonb_set(definition,'{configurationRevision}',to_jsonb((revision+1)::text)),'{fields,0,configurationRevision}',to_jsonb((revision+1)::text)),'active' from local_commerce.catalog_configuration_snapshots where project_id='${project}' and product_id='${productId}';`;
  query(`begin; set local statement_timeout='3s'; ${mutation}
   do $test$ declare r jsonb; begin
    r:=local_commerce.media_copy_command('${project}','${prep.markerDigest}','guest','${digest(verified.owner.ownerId)}',null,'${new Date(verified.expiresAt*1000).toISOString()}','${liveSource.r.receipt.receiptId}','${invalidTarget.draftId}',${invalidTarget.version},'${digest(randomUUID())}','${digest(randomUUID())}');
    if r->>'status'<>'conflict' then raise exception 'drift was not rejected'; end if;
   end $test$; rollback;`);
  assert.equal(configurationDigest(),beforeConfiguration);
 }
 report.checks.push('inactive field and revision drift rejected by real DB command; both fixture transactions rolled back; prior revisions unchanged');
 report.operations=[...known.values()].map(o=>({operationId:o.id,originalDigest:digest(o.original_locator),derivativeDigest:digest(o.derivative_locator)}));
 console.info('TASK 6.3 SYNTHETIC CLEANUP EVIDENCE',JSON.stringify(report));
 return report;
}
