import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {sha256Text,planMigrationLedger} from '../../app/application/local-commerce-migration-ledger.ts';
import {validateProjectMarker} from '../../app/application/local-commerce-environment.ts';
import {createLocalPersistentDraftPort} from '../../app/infrastructure/local-commerce/local-persistent-draft-adapter.server.ts';
import {createLocalPersistentCustomerAuthProvider} from '../../app/application/customer-auth-persistent-provider.server.ts';
import {createConfiguredGuestDraftOwnerService} from '../../app/lib/guest-draft-owner.ts';
import {ensureGuestResourceOwner,resolveGuestResourceOwner} from '../../app/application/guest-resource-ownership.server.ts';
import {catalogTestEnvironment,catalogDatabaseRows,ids} from '../fixtures/local-persistent-catalog.mjs';

const run=process.argv[2];assert.equal(run,'run-f65d52d2');assert.equal(process.argv[3],'--confirm-disposable');
const dir=path.resolve('local/commerce/runtime/disposable',run);
const prep=JSON.parse(readFileSync(path.join(dir,'ledger-preparation.json'),'utf8'));const c=prep.config;
const marker=JSON.parse(readFileSync(path.join(dir,'project-marker.json'),'utf8'));
assert.equal(validateProjectMarker(marker,c),true);assert.equal(sha256Text(JSON.stringify(marker)),prep.markerDigest);
function command(bin,args,input){const r=spawnSync(bin,args,{input,encoding:'utf8'});assert.equal(r.status,0,'local command failed');return r.stdout.trim();}
const names=command('docker',['ps','--filter',`label=com.supabase.cli.workdir=${dir}`,'--format','{{.Names}}']).split('\n');
const db=names.filter(n=>n.startsWith('supabase_db_'));assert.equal(db.length,1);
const sql=q=>command('docker',['exec','-i',db[0],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql(`select local_commerce.verify_project_identity('${c.projectId}','${prep.markerDigest}');`),'t');
const info=JSON.parse(command(path.resolve('node_modules/.bin/supabase'),['status','--workdir',dir,'-o','json']));
assert.equal(new URL(info.API_URL).origin,new URL(c.endpoints.apiUrl).origin);
const env=catalogTestEnvironment({LOCAL_COMMERCE_RUN_ID:run,LOCAL_COMMERCE_PROJECT_ID:c.projectId,LOCAL_COMMERCE_MARKER_DIGEST:prep.markerDigest,
 LOCAL_COMMERCE_SERVICE_ROLE_KEY:info.SERVICE_ROLE_KEY,CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',
 PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET:randomUUID()+randomUUID(),PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS:'3600'});
for(const[k,v]of Object.entries({SHADOW_DB:c.ports.shadowDb,API:c.ports.api,DB:c.ports.db,STUDIO:c.ports.studio,SMTP:c.ports.smtp,IMAGE_HELPER:c.ports.imageHelper}))env['LOCAL_COMMERCE_'+k+'_PORT']=String(v);
env.LOCAL_COMMERCE_API_URL=c.endpoints.apiUrl;env.LOCAL_COMMERCE_RPC_URL=c.endpoints.rpcUrl;env.LOCAL_COMMERCE_STORAGE_URL=c.endpoints.storageUrl;env.LOCAL_COMMERCE_IMAGE_HELPER_URL=c.endpoints.imageHelperUrl;
const report={runId:run,projectId:c.projectId,checks:[]};
async function check(name,f){await f();report.checks.push({name,status:'PASS'});console.log('PASS '+name);}
await check('exact project marker and migration 10/10 ledger/checksums',()=>{
 const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json','utf8'));
 const applied=JSON.parse(sql('select json_agg(json_build_object(\'version\',version,\'migrationId\',migration_id,\'checksum\',checksum,\'projectId\',project_id) order by version) from local_commerce.migration_ledger;'));
 assert.equal(applied.length,10);for(const m of manifest.migrations)assert.equal(sha256Text(readFileSync('local/commerce/migrations/'+m.filename,'utf8')),m.checksum);
 const p=planMigrationLedger({...manifest,projectId:c.projectId},applied,c.projectId);assert.equal(p.status,'ready');assert.equal(p.apply.length,0);report.ledger=applied;
});
const headers={apikey:info.ANON_KEY,authorization:'Bearer '+info.SERVICE_ROLE_KEY,'Content-Type':'application/json','Content-Profile':'local_commerce'};
const rows=catalogDatabaseRows(c.projectId);
rows.configurations[0].definition.fields=[{...rows.configurations[0].definition.fields[0],kind:'image',code:'photo',label:'Synthetic photo',constraints:{allowedMimeTypes:['image/png'],maxBytes:1048576,minDimensions:{width:1,height:1},minImageCount:0,maxImageCount:4,cropEnabled:true}}];
await check('private synthetic Catalog setup',async()=>{
 for(const[key,table]of[['categories','catalog_categories'],['products','catalog_products'],['variants','catalog_variants'],['configurations','catalog_configuration_snapshots'],['rules','catalog_pricing_rules']]){
 const r=await fetch(c.endpoints.apiUrl+'/rest/v1/'+table,{method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates'},body:JSON.stringify(rows[key])});assert.equal(r.status,201,table);}
});
const owners=createConfiguredGuestDraftOwnerService(env);
const guest=await ensureGuestResourceOwner({projectId:c.projectId,context:null,ownerService:owners});assert.equal(guest.status,'issued');
const verifyOwner=async()=>{const r=await resolveGuestResourceOwner({projectId:c.projectId,context:guest.context,ownerService:owners});return r.status==='authorized'?{owner:r.owner,expiresAt:r.owner.expiresAt}:null;};
const ready=await createLocalPersistentDraftPort({environment:env,verifyOwner});assert.equal(ready.status,'ready');
const {port,authority}=ready;const idem=()=>({key:randomUUID(),fingerprint:'draft-test'});let state;
await check('server draft ID/version/confirmed revision and idempotent create',async()=>{
 const cmd={authority,expectedVersion:0,idempotency:idem(),productId:ids.product};const r=await port.create(cmd);assert.equal(r.status,'found');state=r.value;
 assert.equal(state.version,1);assert.equal(state.confirmedRevision,1);assert.deepEqual(state.slots,[]);assert.deepEqual(await port.create(cmd),r);
 assert.ok(!JSON.stringify(state).match(/owner|marker|hash|locator|secret/i));
});
const receiptRefs=[randomUUID(),randomUUID()];
await check('controlled synthetic receipt rows, not upload/Storage acceptance',()=>{
 for(const ref of receiptRefs)sql(`insert into local_commerce.media_objects(project_id,owner_id,internal_locator,media_kind,mime_type,byte_size,object_status)
 select '${c.projectId}',owner_id,'synthetic-${ref}','original','image/png',20,'ready' from local_commerce.configuration_drafts where id='${state.draftId}';
 insert into local_commerce.media_receipts(project_id,owner_id,media_object_id,product_id,field_key,receipt_reference,receipt_status,expires_at)
 select '${c.projectId}',owner_id,id,'${ids.product}','${ids.field}','${ref}','ready',now()+interval '1 hour' from local_commerce.media_objects where internal_locator='synthetic-${ref}';`);
});
await check('two stable slots, reorder, crop and server confirmed revision',async()=>{
 const r=await port.save({authority,draftId:state.draftId,expectedVersion:state.version,idempotency:idem(),slots:receiptRefs.map(receiptReference=>({fieldId:ids.field,receiptReference}))});assert.equal(r.status,'found');state=r.value;
 assert.equal(state.version,2);assert.equal(state.confirmedRevision,2);assert.equal(state.slots.length,2);assert.notEqual(state.slots[0].slotId,state.slots[1].slotId);
 const previous=structuredClone(state);
 const slots=state.slots.slice().reverse().map(s=>({slotId:s.slotId,fieldId:s.fieldId,receiptReference:s.receiptReference,crop:{x:0.1,y:0.1,width:0.8,height:0.8}}));
 const next=await port.save({authority,draftId:state.draftId,expectedVersion:state.version,idempotency:idem(),slots});assert.equal(next.status,'found');state=next.value;
 assert.deepEqual(state.slots.map(s=>s.slotId),previous.slots.map(s=>s.slotId).reverse());assert.deepEqual(state.slots.map(s=>s.position),[0,1]);
 assert.equal(state.confirmedRevision,3);assert.deepEqual(state.slots[0].crop,slots[0].crop);
});
await check('stale save/invalid crop/forged slot cannot change confirmed state',async()=>{
 const base={authority,draftId:state.draftId,expectedVersion:state.version,idempotency:idem()};
 const slots=state.slots.map(({slotId,fieldId,receiptReference,crop})=>({slotId,fieldId,receiptReference,crop}));
 assert.equal((await port.save({...base,expectedVersion:state.version-1,slots})).status,'conflict');
 for(const crop of [{x:NaN,y:0,width:1,height:1},{x:Infinity,y:0,width:1,height:1},{x:-1,y:0,width:1,height:1},{x:0,y:0,width:0,height:1},{x:0.8,y:0,width:1,height:1}])assert.equal((await port.save({...base,slots:[{...slots[0],crop}]})).status,'unavailable');
 assert.equal((await port.save({...base,slots:[{...slots[0],slotId:randomUUID()}]})).status,'unavailable');
 assert.equal((await port.save({...base,slots:[slots[0],slots[0]]})).status,'unavailable');
 assert.deepEqual((await port.read({authority,draftId:state.draftId})).value,state);
});
const childProgram=`import{readFileSync}from'node:fs';import{createLocalPersistentDraftPort}from'./app/infrastructure/local-commerce/local-persistent-draft-adapter.server.ts';import{createConfiguredGuestDraftOwnerService}from'./app/lib/guest-draft-owner.ts';import{resolveGuestResourceOwner}from'./app/application/guest-resource-ownership.server.ts';const x=JSON.parse(readFileSync(0,'utf8'));const verifyOwner=async()=>{const r=await resolveGuestResourceOwner({projectId:x.env.LOCAL_COMMERCE_PROJECT_ID,context:x.context,ownerService:createConfiguredGuestDraftOwnerService(x.env)});return r.status==='authorized'?{owner:r.owner,expiresAt:r.owner.expiresAt}:null};const p=await createLocalPersistentDraftPort({environment:x.env,verifyOwner});if(p.status!=='ready')throw Error('unavailable');const r=await p.port[x.operation]({...x.command,authority:p.authority});console.log(JSON.stringify({pid:process.pid,result:r}));`;
function child(operation,cmd){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',childProgram],{stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',d=>out+=d);p.on('error',reject);p.on('close',code=>code===0?resolve(JSON.parse(out)):reject(Error('child failed')));p.stdin.end(JSON.stringify({env,context:guest.context,operation,command:cmd}));});}
await check('new Node process recovers exact original signed guest draft',async()=>{
 const r=await child('read',{draftId:state.draftId});assert.notEqual(r.pid,process.pid);assert.deepEqual(r.result.value,state);report.restorePid=r.pid;
});
await check('two independent writers: exactly one CAS winner, no lost crop/reorder/version',async()=>{
 const slots=state.slots.map(({slotId,fieldId,receiptReference,crop})=>({slotId,fieldId,receiptReference,crop}));
 const cmd={draftId:state.draftId,expectedVersion:state.version};
 const results=await Promise.all([child('save',{...cmd,idempotency:idem(),slots}),child('save',{...cmd,idempotency:idem(),slots:slots.slice().reverse()})]);
 assert.notEqual(results[0].pid,results[1].pid);assert.equal(results.filter(r=>r.result.status==='found').length,1);
 assert.equal(results.filter(r=>r.result.status==='conflict'&&r.result.reason==='version_mismatch').length,1);
 const next=(await port.read({authority,draftId:state.draftId})).value;assert.equal(next.version,state.version+1);assert.equal(next.confirmedRevision,state.confirmedRevision+1);state=next;report.concurrency=results.map(({pid,result})=>({pid,status:result.status}));
});
await check('wrong owner/project/marker/expired authority rejected',async()=>{
 const foreign=await ensureGuestResourceOwner({projectId:c.projectId,context:null,ownerService:owners});
 const p=await createLocalPersistentDraftPort({environment:env,verifyOwner:async()=>({owner:foreign.owner,expiresAt:foreign.owner.expiresAt})});assert.equal(p.status,'ready');assert.equal((await p.port.read({authority:p.authority,draftId:state.draftId})).status,'unavailable');
 const bad=await createLocalPersistentDraftPort({environment:{...env,LOCAL_COMMERCE_MARKER_DIGEST:'0'.repeat(64)},verifyOwner});assert.equal(bad.status,'ready');assert.equal((await bad.port.read({authority:bad.authority,draftId:state.draftId})).status,'unavailable');
 assert.equal((await createLocalPersistentDraftPort({environment:env,verifyOwner:async()=>({owner:{...guest.owner,projectId:'wrong'},expiresAt:guest.owner.expiresAt})})).status,'unavailable');
 assert.equal((await createLocalPersistentDraftPort({environment:env,verifyOwner:async()=>({owner:guest.owner,expiresAt:1})})).status,'unavailable');
});
await check('member session cannot claim guest; revoke immediately rejects reconstructed reads',async()=>{
 const auth=createLocalPersistentCustomerAuthProvider(env);const registered=await auth.signUp({email:'draft-'+randomUUID()+'@example.test',password:'A-valid-test-password-42!'});assert.equal(registered.status,'ok');
 const verifyMember=async()=>{const r=await auth.getSession(registered.value.sessionId);if(r.status!=='ok'||!r.value.authenticated)return null;const s=r.value;return{owner:{kind:'customer',projectId:c.projectId,ownerId:s.ownerId,customerId:s.customer.id},expiresAt:Date.parse(s.expiresAt)/1000};};
 // Use the actual provider projection (not a guessed customer identity).
 const current=await auth.getSession(registered.value.sessionId);
 assert.equal(current.status,'ok');assert.equal(current.value.authenticated,true);
 report.memberSessionStatus=current.status;
 const member=await createLocalPersistentDraftPort({environment:env,verifyOwner:verifyMember});assert.equal(member.status,'ready');
 assert.equal((await member.port.read({authority:member.authority,draftId:state.draftId})).status,'unavailable');
 const own=await member.port.create({authority:member.authority,expectedVersion:0,idempotency:idem(),productId:ids.product});assert.equal(own.status,'found');
 await auth.signOut(registered.value.sessionId);assert.equal((await member.port.read({authority:member.authority,draftId:own.value.draftId})).status,'unavailable');
});
await check('RLS and restricted RPC deny public/anon/authenticated direct authority',async()=>{
 for(const role of ['anon','authenticated']){
  assert.equal(sql(`select has_table_privilege('${role}','local_commerce.draft_command_bindings','INSERT,UPDATE,DELETE,SELECT');`),'f');
  assert.equal(sql(`select has_function_privilege('${role}','local_commerce.draft_command(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb)','EXECUTE');`),'f');
 }
 const r=await fetch(c.endpoints.rpcUrl+'/rest/v1/rpc/draft_command',{method:'POST',headers:{apikey:info.ANON_KEY,authorization:'Bearer '+info.ANON_KEY,'Content-Type':'application/json','Content-Profile':'local_commerce'},body:JSON.stringify({p_project_id:c.projectId,p_marker_digest:prep.markerDigest,p_owner_kind:'guest',p_owner_selector:'0'.repeat(64),p_customer_id:null,p_authority_expires_at:new Date(Date.now()+60000).toISOString(),p_operation:'read',p_draft_id:state.draftId,p_product_id:null,p_expected_version:0,p_command_key:null,p_fingerprint:null,p_slots:null})});
 assert.ok([401,403].includes(r.status),`anon RPC status ${r.status}`);report.anonRpcStatus=r.status;
});
await check('only confirmed content restores; browser working-state objects are not used',async()=>{
 const unconfirmed=randomUUID();
 sql(`insert into local_commerce.configuration_drafts(project_id,id,owner_id,product_id,lifecycle,values_snapshot)
 select project_id,'${unconfirmed}',owner_id,product_id,'active','{"unsaved":"synthetic test only"}'::jsonb
 from local_commerce.configuration_drafts where id='${state.draftId}';`);
 assert.equal((await port.read({authority,draftId:unconfirmed})).status,'unavailable');
 assert.deepEqual((await port.read({authority,draftId:state.draftId})).value,state);
});
writeFileSync(path.join(dir,'task-4.4-evidence.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.checks.length,runId:run}));
