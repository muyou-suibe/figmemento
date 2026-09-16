// Exact retained disposable stack, fresh synthetic Orders through actual Worker
// HTTP. Authorized private preview writes only; no reset/delete or existing process stop.
import {createSignedAdminSession} from '../../app/application/admin-session.ts';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {catalogDatabaseRows,catalogTestEnvironment,ids} from '../fixtures/local-persistent-catalog.mjs';
const run='run-5576dfd8',project=`figmemento-local-commerce-test-${run}`;
const dir=`${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep=JSON.parse(readFileSync(`${dir}/ledger-preparation.json`)),c=prep.config;
const db='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
function command(bin,args,input){const r=spawnSync(bin,args,{input,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});assert.equal(r.status,0,r.error?.code??'bounded command failed');return r.stdout.trim();}
const inspected=JSON.parse(command('docker',['inspect',db]))[0];assert.equal(inspected.Id,db);assert.equal(inspected.Config.Labels['com.supabase.cli.workdir'],dir);assert.equal(inspected.State.Status,'running');
assert.equal(c.projectId,project);assert.equal(c.projectKind,'disposable_test');
const sql=q=>command('docker',['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"),'17');
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));assert.equal(manifest.schemaVersion,26);
const ledger=JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length,26);manifest.migrations.forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);});
const info=JSON.parse(command('node_modules/.bin/supabase',['status','--workdir',dir,'-o','json']));assert.equal(info.API_URL,c.endpoints.apiUrl);
const env={...process.env,...catalogTestEnvironment({LOCAL_COMMERCE_RUN_ID:run,LOCAL_COMMERCE_PROJECT_ID:project,LOCAL_COMMERCE_MARKER_DIGEST:prep.markerDigest,
 LOCAL_COMMERCE_SERVICE_ROLE_KEY:info.SERVICE_ROLE_KEY,CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',LOCAL_CHECKOUT_SOURCE:'local_persistent',LOCAL_ORDER_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent',LOCAL_PAYMENT_SOURCE:'local_persistent',LOCAL_FULFILLMENT_SOURCE:'local_persistent',LOCAL_FULFILLMENT_OPERATOR:'enabled',LOCAL_TRACKING_SOURCE:'disabled',ADMIN_ACCEPTANCE_SOURCE:'local_persistent',ADMIN_PASSWORD:randomBytes(32).toString('hex'),
 LOCAL_COMMERCE_IMAGE_HELPER_SECRET:randomBytes(32).toString('base64url'),LOCAL_ORDER_CAPABILITY_SECRET:randomBytes(32).toString('hex'),LOCAL_ORDER_CAPABILITY_TTL_SECONDS:'3600',PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET:randomBytes(48).toString('base64url'),PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS:'3600'})};
for(const [k,v] of Object.entries({SHADOW_DB:c.ports.shadowDb,API:c.ports.api,DB:c.ports.db,STUDIO:c.ports.studio,SMTP:c.ports.smtp,IMAGE_HELPER:c.ports.imageHelper}))env[`LOCAL_COMMERCE_${k}_PORT`]=String(v);
for(const [k,v] of Object.entries({API:c.endpoints.apiUrl,RPC:c.endpoints.rpcUrl,STORAGE:c.endpoints.storageUrl,IMAGE_HELPER:c.endpoints.imageHelperUrl}))env[`LOCAL_COMMERCE_${k}_URL`]=v;
Object.assign(env,{CLOUDFLARE_INCLUDE_PROCESS_ENV:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'});
const ports=[c.ports.imageHelper+2,c.ports.imageHelper+3],origins=ports.map(p=>`http://127.0.0.1:${p}`);
for(const p of [...ports,c.ports.imageHelper])await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(p,'127.0.0.1',()=>s.close(resolve));});
const actualFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 const u=new URL(input);assert.ok([...origins,c.endpoints.apiUrl,c.endpoints.imageHelperUrl].includes(u.origin),'only exact local endpoints');
 assert.notEqual(options?.method,'DELETE','no deletion authorized');
 try{return await actualFetch(input,options);}catch(error){
  // No query, cookies, headers, payload or credential in diagnostics.
  if(u.pathname!=='/api/customer-auth/session')console.error(JSON.stringify({stage:'HTTP transport',method:options?.method??'GET',path:u.pathname,error:error?.name}));
  throw error;
 }
};
const children=[];let logs='';
function start(index,operator='enabled',fault='preview-trace'){const p=spawn(process.execPath,['tests/database/local-commerce-test-worker.mjs',run,'--confirm-disposable',String(ports[index]),fault],{env:{...env,LOCAL_FULFILLMENT_OPERATOR:operator},detached:true,stdio:['ignore','pipe','pipe']});children.push(p);for(const s of [p.stdout,p.stderr])s.on('data',b=>{logs=(logs+b).slice(-18000);});return p;}
async function stop(p){if(p.exitCode!==null||p.signalCode!==null)return;const done=new Promise(r=>p.once('exit',r));process.kill(-p.pid,'SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,5000))]);if(p.exitCode===null&&p.signalCode===null){process.kill(-p.pid,'SIGKILL');await done;}}
async function ready(p,index){for(let i=0;i<50;i++){assert.equal(p.exitCode,null,'Worker exited');try{const r=await fetch(origins[index]+'/api/customer-auth/session',{signal:AbortSignal.timeout(2000)});await r.arrayBuffer();if(r.status===200)return;}catch{/* readiness only */}await new Promise(r=>setTimeout(r,500));}assert.fail('Worker readiness blocked');}
const headers={apikey:info.SERVICE_ROLE_KEY,authorization:`Bearer ${info.SERVICE_ROLE_KEY}`,'Content-Type':'application/json','Content-Profile':'local_commerce'};
let encoded=JSON.stringify(catalogDatabaseRows(project));for(const id of Object.values(ids))encoded=encoded.replaceAll(id,randomUUID());
const rows=JSON.parse(encoded),suffix=randomUUID().replaceAll('-','');
rows.products[0].fulfillment_definition.requiresProductionPreview=true;
rows.categories[0].slug=`admission-${suffix}`;rows.products[0].slug=`admission-${suffix}`;rows.variants[0].sku_code=`ADMISSION-${suffix}`;
rows.rules=rows.rules.filter(r=>r.definition.kind==='shipping');rows.rules[0].rule_key=`admission-${suffix}`;rows.rules[0].definition.method=`payment_${suffix}`;
let disabledEncoded=JSON.stringify(rows);
for(const id of new Set(disabledEncoded.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)))disabledEncoded=disabledEncoded.replaceAll(id,randomUUID());
const disabledRows=JSON.parse(disabledEncoded);disabledRows.rules=[];
disabledRows.products[0].fulfillment_definition.requiresProductionPreview=false;
disabledRows.categories[0].slug+='-disabled';disabledRows.products[0].slug+='-disabled';disabledRows.variants[0].sku_code+='-DISABLED';
for(const [k,t] of Object.entries({categories:'catalog_categories',products:'catalog_products',variants:'catalog_variants',configurations:'catalog_configuration_snapshots',rules:'catalog_pricing_rules'})){
 const r=await fetch(`${c.endpoints.apiUrl}/rest/v1/${t}`,{method:'POST',headers,body:JSON.stringify([...rows[k],...disabledRows[k]]),signal:AbortSignal.timeout(5000)});assert.equal(r.status,201,`synthetic ${k}`);await r.arrayBuffer();
}
const handoff={productId:rows.products[0].id,variantId:rows.variants[0].id,skuCode:rows.variants[0].sku_code,selectedOptions:rows.variants[0].selected_options,configurationRevision:'1',customizationValues:[]};
const disabledHandoff={...handoff,productId:disabledRows.products[0].id,variantId:disabledRows.variants[0].id,skuCode:disabledRows.variants[0].sku_code,selectedOptions:disabledRows.variants[0].selected_options};
const cookie=jar=>[...jar].map(([k,v])=>`${k}=${v}`).join('; ');
function accept(jar,r){for(const h of r.headers.getSetCookie()){const pair=h.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}}
const send=(index,path,body,jar)=>fetch(origins[index]+path,{method:'POST',headers:{origin:origins[index],cookie:typeof jar==='string'?jar:cookie(jar),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
async function newOrder(jar=new Map(),handoffs=[handoff],quantity=1){
 for(const h of handoffs){
  const cart=await send(0,'/api/cart',{handoff:h},jar);assert.equal(cart.status,200,'Cart');accept(jar,cart);const publicCart=await cart.json();
  if(quantity>1){const lineId=publicCart.lines.at(-1).lineId;assert.match(lineId,/^[a-f0-9-]{36}$/);const updated=await fetch(origins[0]+'/api/cart/items/'+lineId,{method:'PATCH',headers:{origin:origins[0],cookie:cookie(jar),'Content-Type':'application/json'},body:JSON.stringify({quantity}),signal:AbortSignal.timeout(10000)});assert.equal(updated.status,200);await updated.arrayBuffer();}
 }
 const input={creationAttemptId:randomUUID(),email:'payment@example.invalid',firstName:'Synthetic',lastName:'Payment',country:'US',city:'Test',addressLine1:'Test only',postalCode:'00000',shippingMethod:rows.rules[0].definition.method};
 let r=await send(0,'/api/local-orders',input,jar);if(r.status===204){accept(jar,r);r=await send(0,'/api/local-orders',input,jar);}assert.equal(r.status,200,'Order');const {publicReference}=await r.json();assert.match(publicReference,/^FM-LOCAL-[A-Z0-9]{16}$/);
 const id=sql(`select id from local_commerce.orders where project_id='${project}' and public_reference='${publicReference}';`);assert.match(id,/^[a-f0-9-]{36}$/);
 const cartId=decodeURIComponent([...jar].find(([k])=>k.includes('cart'))[1]);assert.match(cartId,/^[a-f0-9-]{36}$/);
 return {jar,publicReference,id,cartId};
}
const pay=(o,key,outcome,index=0,jar=o.jar)=>send(index,'/api/local-payments',{publicReference:o.publicReference,paymentAttemptId:key,outcome},jar);
const upstream=o=>{
 const scopes={order_purchase_snapshots:`order_id='${o.id}'`,order_item_purchase_snapshots:`order_item_id in(select id from local_commerce.order_items where order_id='${o.id}')`,order_item_receipt_bindings:`order_item_id in(select id from local_commerce.order_items where order_id='${o.id}')`,payment_attempts:`order_id='${o.id}'`,payment_actions:`order_id='${o.id}'`,carts:`id='${o.cartId}'`,cart_lines:`cart_id='${o.cartId}'`,catalog_products:`id in('${handoff.productId}','${disabledHandoff.productId}')`,catalog_variants:`product_id in('${handoff.productId}','${disabledHandoff.productId}')`,catalog_configuration_snapshots:`product_id in('${handoff.productId}','${disabledHandoff.productId}')`};
 return JSON.parse(sql(`select json_agg(v order by v->>'domain') from (${Object.entries(scopes).map(([t,w])=>`select json_build_object('domain','${t}','count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),''))) v from local_commerce.${t} t where ${w}`).join(' union all ')}) x;`));
};
const path=o=>'/api/local-fulfillment/operator/'+o.publicReference;
const admit=(o,key,index=0)=>send(index,path(o),{fulfillmentActionId:key,actionKind:'enter_photo_review'},o.jar);
const report={run,project,ledger:26,results:[],races:[],restarts:[]};
const customerPath=o=>'/api/local-fulfillment/'+o.publicReference;
const version=o=>Number(sql(`select version from local_commerce.fulfillments where order_id='${o.id}';`));
const action=(o,kind,v,note)=>({fulfillmentActionId:randomUUID(),actionKind:kind,expectedPreviewVersion:v,expectedAggregateVersion:version(o),...(note===undefined?{}:{revisionNote:note})});
const customer=(o,a,index=0,jar=o.jar)=>send(index,customerPath(o),a,jar);
async function checked(r,status=200){assert.equal(r.status,status);const body=await r.json();assert.doesNotMatch(JSON.stringify(body),/password|sessionHash|capabilityHash|object_locator|service_role/i);return body;}
const orders=[];
const frozen=o=>sql("select md5(coalesce(string_agg(v::text,',' order by v::text),'')) from ("+
 ['preview_manifests','preview_manifest_entries','fulfillment_preview_media']
 .map(t=>"select to_jsonb(t) v from local_commerce."+t+" t where order_id='"+o.id+"'")
 .concat("select to_jsonb(t) v from local_commerce.fulfillment_decisions t where order_id='"+o.id+"' and decision_kind in ('customer_approve','customer_revision')").join(' union all ')+") s;");
const originalClock=sql("select pg_get_functiondef('local_commerce.fulfillment_timeout_now(text,uuid,uuid)'::regprocedure);");
const clocks=new Map();
function setClock(o,offset=0){
 const m=JSON.parse(sql("select json_build_object('id',id,'deadline',approval_deadline_at,'published',published_at) from local_commerce.preview_manifests where order_id='"+o.id+"' order by manifest_version desc limit 1;"));
 assert.equal(Date.parse(m.deadline)-Date.parse(m.published),259200000);
 assert.ok(orders.includes(o));assert.match(m.id,/^[a-f0-9-]{36}$/);
 // Keep microsecond precision at equality; offset is applied by PostgreSQL.
 assert.ok([-1,0,1].includes(offset));
 clocks.set(m.id,{order:o.id,offset});
 sql("create or replace function local_commerce.fulfillment_timeout_now(p_project_id text,p_order_id uuid,p_manifest_id uuid) returns timestamptz language sql volatile set search_path=pg_catalog as $clock$ select case "+[...clocks].map(([id,v])=>"when p_project_id='"+project+"' and p_order_id='"+v.order+"'::uuid and p_manifest_id='"+id+"'::uuid then (select approval_deadline_at + interval '"+v.offset+" second' from local_commerce.preview_manifests where project_id='"+project+"' and id='"+id+"'::uuid)").join(' ')+" else clock_timestamp() end;$clock$;");
 return m;
}
const allEffects=o=>sql("select md5(coalesce(string_agg(v::text,',' order by v::text),'')) from ("+
 ['fulfillments','photo_reviews','fulfillment_decisions','preview_manifests','preview_manifest_entries','fulfillment_preview_media']
 .map(t=>"select to_jsonb(t) v from local_commerce."+t+" t where order_id='"+o.id+"'").join(' union all ')+") s;");
const audits=o=>JSON.parse(sql("select json_agg(x order by kind) from (select decision_kind kind,count(*) count,count(result->'audit') audits,count(distinct action_key) keys from local_commerce.fulfillment_decisions where order_id='"+o.id+"' group by decision_kind) x;"));
try {
 let a=start(0);await ready(a,0);let b=start(1);await ready(b,1);
 const helper=spawn(process.execPath,['local/commerce/image-helper/server.mjs'],{env,detached:true,stdio:'ignore'});children.push(helper);
 await new Promise(r=>setTimeout(r,1000));assert.equal(helper.exitCode,null);
 const sharp=createRequire(process.cwd()+'/local/commerce/image-helper/package.json')('sharp');
 const bytes=await sharp({create:{width:14,height:9,channels:3,background:'#ac7053'}}).png().toBuffer();
 async function restart(label){const old=a.pid;await stop(a);a=start(0);await ready(a,0);assert.notEqual(old,a.pid);report.restarts.push({label,old,new:a.pid,classification:'committed response discarded, then process restart replay'});}
 async function admitted(handoffs=[handoff]){
  const o=await newOrder(new Map(),handoffs);await checked(await pay(o,randomUUID(),'success'));o.admission=randomUUID();
  o.admissionResult=await checked(await admit(o,o.admission));o.before=upstream(o);orders.push(o);return o;
 }
 function mediaInput(o){return {item:sql("select id from local_commerce.order_items where order_id='"+o.id+"' order by item_sequence limit 1;"),actionId:randomUUID(),expectedVersion:version(o)};}
 async function upload(o,input,index=0,payload=bytes){
  const form=new FormData();form.set('file',new File([payload],'synthetic.png',{type:'image/png'}));
  return fetch(origins[index]+path(o)+'/preview?'+new URLSearchParams({orderItemId:input.item,actionId:input.actionId,expectedVersion:String(input.expectedVersion)}),{
   method:'POST',headers:{origin:origins[index],cookie:cookie(o.jar)},body:form,signal:AbortSignal.timeout(20000)});
 }
 const publication=(o,m)=>({actionId:randomUUID(),expectedVersion:version(o),entries:[{orderItemId:m.orderItemId,previewMediaId:m.previewMediaId}]});
 const publish=(o,input,index=0)=>send(index,path(o)+'/preview',input,o.jar);
 async function pending(handoffs=[handoff]){const o=await admitted(handoffs);o.media=mediaInput(o);o.mediaResult=await checked(await upload(o,o.media));o.pub=publication(o,o.mediaResult.value);o.pubResult=await checked(await publish(o,o.pub));return o;}
 async function exact(o,label,invoke,original,field='value'){
  const before=allEffects(o);const r=await checked(await invoke());assert.deepEqual(r[field],original[field],label);
  assert.notEqual(r[field],undefined,label+' actual projection');
  assert.equal(allEffects(o),before,label+' zero mutation/audit');report.results.push(label);console.info(JSON.stringify({completed:label}));
 }


 const admin=new Map();const login=await send(0,'/api/admin/login',{password:env.ADMIN_PASSWORD},admin);
 assert.equal(login.status,200);accept(admin,login);await login.arrayBuffer();
 const timeoutInput=o=>({actionKind:'operator_timeout',fulfillmentActionId:randomUUID(),expectedAggregateVersion:version(o),
  expectedPreviewVersion:o.pubResult.value.manifestVersion,manifestId:o.pubResult.value.manifestId,reason:'Reviewed after the deadline'});
 const timeout=(o,input,index=0,jar=admin)=>send(index,'/api/local-fulfillment/admin/'+o.publicReference+'/timeout',input,jar);
 const lifecycle=(o,input,index=0)=>send(index,path(o),input,o.jar);
 // Existing pre-0025 NULL deadlines are not repaired/backfilled. Exercise only
 // the fail-closed HTTP command and verify the complete Order-local state.
 const legacy=JSON.parse(sql("select json_build_object('id',o.id,'publicReference',o.public_reference,'manifestId',m.id,'manifestVersion',m.manifest_version,'version',f.version) from local_commerce.orders o join local_commerce.fulfillments f on f.order_id=o.id join local_commerce.preview_manifests m on m.id=f.current_manifest_id where o.project_id='"+project+"' and o.lifecycle_status='paid' and f.fulfillment_state='preview_pending' and m.approval_deadline_at is null order by o.id limit 1;"));
 assert.ok(legacy,'existing legacy NULL-deadline acceptance fixture');
 const legacyBefore=allEffects(legacy);
 await checked(await timeout(legacy,{actionKind:'operator_timeout',fulfillmentActionId:randomUUID(),expectedAggregateVersion:legacy.version,expectedPreviewVersion:legacy.manifestVersion,manifestId:legacy.manifestId,reason:'Missing deadline must reject'}),409);
 assert.equal(allEffects(legacy),legacyBefore);
 report.results.push('legacy missing persisted deadline: real signed Admin HTTP 409, zero mutation/backfill');
 const o=await pending();const t=timeoutInput(o);const before=allEffects(o);const frozenBefore=frozen(o);
 await checked(await timeout(o,t),409);
 setClock(o,-1);await checked(await timeout(o,t),409);
 assert.equal(allEffects(o),before);
 setClock(o,0);
 for(const reason of ['', '   ', 'x'.repeat(501),'😀'.repeat(251)])await checked(await timeout(o,{...t,reason}),400);
 for(const patch of [{expectedPreviewVersion:undefined},{expectedPreviewVersion:4},{serverNow:'later'},{deadline:'later'},{ownerId:'forged'}])
  await checked(await timeout(o,{...t,...patch}),400);
 await checked(await timeout(o,{...t,expectedAggregateVersion:t.expectedAggregateVersion+1}),409);
 await checked(await timeout(o,{...t,expectedPreviewVersion:2}),409);
 await checked(await timeout(o,t,0,new Map()),401);
 await checked(await timeout(o,t,0,o.jar),401);
 const expired=new Map(admin);expired.set('photogift-admin-session',await createSignedAdminSession(env.ADMIN_PASSWORD,Math.floor(Date.now()/1000)-604801));
 await checked(await timeout(o,t,0,expired),401);
 const wrong=new Map(admin);wrong.set('photogift-admin-session','invalid.signature');await checked(await timeout(o,t,0,wrong),401);
 const accepted=await checked(await timeout(o,{...t,reason:' \t'+'😀'.repeat(250)+'\n'}));
 assert.equal(accepted.result.status,'preview_approved');assert.equal(accepted.result.reason,'😀'.repeat(250));
 assert.equal(accepted.result.decisionKind,'operator_timeout');assert.equal(accepted.result.confirmedAt,accepted.result.approvalDeadlineAt);
 const canonical={...t,reason:'😀'.repeat(250)};
 const originalPid=a.pid;await restart('timeout committed response discarded');
 const relogin=await send(0,'/api/admin/login',{password:env.ADMIN_PASSWORD},admin);accept(admin,relogin);await relogin.arrayBuffer();
 await exact(o,'timeout restart replay',()=>timeout(o,canonical),accepted,'result');
 assert.notEqual(originalPid,a.pid);
 await checked(await timeout(o,{...canonical,reason:'changed'}),409);
 await checked(await timeout(o,{...canonical,expectedAggregateVersion:t.expectedAggregateVersion+1}),409);
 assert.equal(sql("select count(*) from local_commerce.fulfillment_decisions where order_id='"+o.id+"' and decision_kind='customer_approve';"),'0');
 await checked(await lifecycle(o,{actionKind:'start_production',fulfillmentActionId:randomUUID(),expectedAggregateVersion:version(o)}));
 await exact(o,'timeout replay after separate production',()=>timeout(o,canonical),accepted,'result');
 await checked(await timeout(o,canonical,0,expired),401);
 assert.equal(frozen(o),frozenBefore);
 report.immutableHistory={before:frozenBefore,after:frozen(o)};
 report.results.push('before/exact deadline, UTF16, signed Admin/expiry, independent production consumption');

 // Response-loss and races use simultaneously live, independent Workers.
 for(const mode of ['same-key','different-key','revision','approval']){
  const race=await pending();setClock(race,1);const left=timeoutInput(race);
  const right=mode==='same-key'?left:{...left,fulfillmentActionId:randomUUID()};
  const other=mode==='revision'?customer(race,action(race,'request_revision',1,'please revise'),1):
    mode==='approval'?customer(race,action(race,'approve_preview',1),1):timeout(race,right,1);
  const responses=await Promise.all([timeout(race,left,0),other]);const statuses=responses.map(r=>r.status);
  const bodies=await Promise.all(responses.map(r=>r.json()));
  assert.deepEqual([...statuses].sort(),mode==='same-key'?[200,200]:[200,409]);
  if(mode==='same-key')assert.deepEqual(bodies[0].result,bodies[1].result);
  const counts=audits(race),decisions=counts.filter(c=>['operator_timeout','customer_approve','customer_revision'].includes(c.kind));
  assert.equal(decisions.reduce((sum,c)=>sum+c.count,0),1);
  assert.ok(Number(sql("select revision_requests_used from local_commerce.fulfillments where order_id='"+race.id+"';"))<=2);
  report.races.push({mode,pids:[a.pid,b.pid],statuses,decisions});
 }
 const revisions=await pending();let oldInput=timeoutInput(revisions);
 for(let v=1;v<=2;v++){
  await checked(await customer(revisions,action(revisions,'request_revision',v,'revise')));
  setClock(revisions,1);await checked(await timeout(revisions,{...oldInput,expectedAggregateVersion:version(revisions)}),409);
  const mi=mediaInput(revisions),mr=await checked(await upload(revisions,mi));
  revisions.pub=publication(revisions,mr.value);revisions.pubResult=await checked(await publish(revisions,revisions.pub));
  await checked(await timeout(revisions,{...oldInput,expectedAggregateVersion:version(revisions)}),409);
  oldInput=timeoutInput(revisions);await checked(await timeout(revisions,oldInput),409);
 }
 const revisionHistory=frozen(revisions);
 setClock(revisions,1);const final=await checked(await timeout(revisions,timeoutInput(revisions)));
 assert.equal(frozen(revisions),revisionHistory);
 assert.equal(final.result.revisionRequestsUsed,2);assert.equal(final.result.manifestVersion,3);
 assert.equal(sql("select max(manifest_version) from local_commerce.preview_manifests where order_id='"+revisions.id+"';"),'3');
 await checked(await customer(revisions,action(revisions,'request_revision',3,'third')),409);
 report.results.push('revision pending and old deadline reject; fresh v2/v3 deadlines; no counter reset/no v4');
 for(const item of orders){
  assert.deepEqual(upstream(item),item.before);
  for(const table of ['shipments','shipment_events'])assert.equal(sql("select count(*) from local_commerce."+table+" where order_id='"+item.id+"';"),'0');
 }
 report.upstreamDigests=orders.map(item=>({order:item.publicReference,before:item.before,after:upstream(item)}));
 report.status='PASS';report.task='7.6';report.classification='LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE';
 report.clock='temporary DB test clock scoped only to newly created manifest IDs; real HTTP/RPC, restored in finally';
 console.info(JSON.stringify(report));
}finally{
 try {for(const p of children.reverse())await stop(p);}
 finally {
  sql(originalClock);
  assert.equal(sql("select pg_get_functiondef('local_commerce.fulfillment_timeout_now(text,uuid,uuid)'::regprocedure);"),originalClock);
  globalThis.fetch=actualFetch;
  console.info(JSON.stringify({clockRestored:true,task:'7.6'}));
 }
}
