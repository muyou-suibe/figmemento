// Exact retained disposable stack, fresh synthetic Orders through actual Worker
// HTTP. Authorized private preview writes only; no reset/delete or existing process stop.
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
 LOCAL_COMMERCE_SERVICE_ROLE_KEY:info.SERVICE_ROLE_KEY,CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',LOCAL_CHECKOUT_SOURCE:'local_persistent',LOCAL_ORDER_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent',LOCAL_PAYMENT_SOURCE:'local_persistent',LOCAL_FULFILLMENT_SOURCE:'local_persistent',LOCAL_FULFILLMENT_OPERATOR:'enabled',LOCAL_TRACKING_SOURCE:'disabled',ADMIN_ACCEPTANCE_SOURCE:'local_fake',
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
 async function admitted(){
  const o=await newOrder();await checked(await pay(o,randomUUID(),'success'));o.admission=randomUUID();
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
 async function pending(){const o=await admitted();o.media=mediaInput(o);o.mediaResult=await checked(await upload(o,o.media));o.pub=publication(o,o.mediaResult.value);o.pubResult=await checked(await publish(o,o.pub));return o;}
 async function exact(o,label,invoke,original,field='value'){
  const before=allEffects(o);const r=await checked(await invoke());assert.deepEqual(r[field],original[field],label);
  assert.notEqual(r[field],undefined,label+' actual projection');
  assert.equal(allEffects(o),before,label+' zero mutation/audit');report.results.push(label);console.info(JSON.stringify({completed:label}));
 }
 const chain=await pending();
 await restart('admission/media ready/v1 publication');
 await exact(chain,'admission after aggregate exists',()=>admit(chain,chain.admission),chain.admissionResult,'fulfillment');
 await exact(chain,'ready after v1 publication',()=>upload(chain,chain.media),chain.mediaResult);
 await exact(chain,'v1 publication after preview_pending',()=>publish(chain,chain.pub),chain.pubResult);
 const old=[];
 for(let v=1;v<=2;v++){
  const input=action(chain,'request_revision',v,'adjust '+v),result=await checked(await customer(chain,input));
  assert.equal(result.result.revisionRequestsUsed,v);
  old.push({type:'revision',input,result});
  await restart('revision '+v);
  await exact(chain,'revision '+v+' restart',()=>customer(chain,input),result,'result');
  const m=mediaInput(chain),mr=await checked(await upload(chain,m)),p=publication(chain,mr.value),pr=await checked(await publish(chain,p));
  assert.equal(pr.value.manifestVersion,v+1);old.push({type:'publication',input:p,result:pr});
  await restart('publication v'+(v+1));
  await exact(chain,'publication v'+(v+1)+' restart',()=>publish(chain,p),pr);
 }
 const atV3=allEffects(chain);
 for(const oldAction of old)await exact(chain,'old '+oldAction.type+' after v3',()=>oldAction.type==='revision'?customer(chain,oldAction.input):publish(chain,oldAction.input),oldAction.result,oldAction.type==='revision'?'result':'value');
 await exact(chain,'historical v1 ready after v3',()=>upload(chain,chain.media),chain.mediaResult);
 await exact(chain,'historical admission after v3',()=>admit(chain,chain.admission),chain.admissionResult,'fulfillment');
 assert.equal(allEffects(chain),atV3);
 const revision=old[0].input;report.conflicts=[];
 for(const [label,invoke] of [
  ['aggregate version',()=>customer(chain,{...revision,expectedAggregateVersion:revision.expectedAggregateVersion+1})],
  ['preview version',()=>customer(chain,{...revision,expectedPreviewVersion:2})],
  ['note',()=>customer(chain,{...revision,revisionNote:'changed'})],
  ['action kind',()=>customer(chain,{...revision,actionKind:'approve_preview',revisionNote:undefined})],
  ['publication media',()=>publish(chain,{...chain.pub,entries:chain.pub.entries.map(e=>({...e,previewMediaId:randomUUID()}))})],
  ['publication aggregate',()=>publish(chain,{...chain.pub,expectedVersion:chain.pub.expectedVersion+1})],
  ['media content',()=>upload(chain,chain.media,0,Buffer.from('changed-content'))],
 ]){
  const before=allEffects(chain);await checked(await invoke(),409);assert.equal(allEffects(chain),before);report.conflicts.push(label);
 }
 const {createPersistentOrderCapabilityCodec}=await import('../../app/server/local-order-capability.server.ts');
 const codec=await createPersistentOrderCapabilityCodec(env,{projectId:project,markerDigest:prep.markerDigest});
 const expired=await codec.issue(Math.floor(Date.now()/1000)-7200);
 for(const jar of ['',cookie(chain.jar).replace(/figmemento-local-order-access=[^;]+/,'figmemento-local-order-access='+expired)])
  await checked(await customer(chain,revision,1,jar),404);
 const disabledBefore=allEffects(chain);await stop(b);b=start(1,'disabled');await ready(b,1);
 for(const invoke of [()=>admit(chain,chain.admission,1),()=>upload(chain,chain.media,1),()=>publish(chain,chain.pub,1)]){
  const r=await invoke();assert.ok([403,404].includes(r.status));await r.arrayBuffer();
 }
 assert.equal(allEffects(chain),disabledBefore);report.disabledOperatorPid=b.pid;
 await stop(b);b=start(1);await ready(b,1);
 const approval=await pending(),approvalInput=action(approval,'approve_preview',1);
 const approvalResult=await checked(await customer(approval,approvalInput));await restart('customer approval');
 await exact(approval,'approval restart after preview_approved',()=>customer(approval,approvalInput),approvalResult,'result');
 for(const kind of ['same-approval','same-revision','same-publication','competing-publications','approval-vs-revision','last-revision','publication-vs-stale']){
  const o=await pending();let left,right;
  if(['same-publication','competing-publications','publication-vs-stale','last-revision'].includes(kind)){
   await checked(await customer(o,action(o,'request_revision',1,'first')));
   const m=await checked(await upload(o,mediaInput(o))),p=publication(o,m.value);
   if(kind==='last-revision')await checked(await publish(o,p));
   else {left=i=>publish(o,p,i);const stale=action(o,'approve_preview',1),other={...p,actionId:randomUUID()};
    right=i=>kind==='publication-vs-stale'?customer(o,stale,i):publish(o,kind==='competing-publications'?other:p,i);}
  }
  if(!left){
   const input=action(o,kind==='same-revision'||kind==='last-revision'?'request_revision':'approve_preview',kind==='last-revision'?2:1,kind==='same-revision'||kind==='last-revision'?'revision':undefined);
   const other=kind==='approval-vs-revision'?{...input,fulfillmentActionId:randomUUID(),actionKind:'request_revision',revisionNote:'competing'}:kind==='last-revision'?{...input,fulfillmentActionId:randomUUID()}:input;
   left=i=>customer(o,input,i);right=i=>customer(o,other,i);
  }
  const count=()=>Number(sql("select count(*) from local_commerce.fulfillment_decisions where order_id='"+o.id+"';"));
  const before=count();assert.equal(a.exitCode,null);assert.equal(b.exitCode,null);
  const responses=await Promise.all([left(0),right(1)]),statuses=responses.map(r=>r.status),bodies=await Promise.all(responses.map(r=>r.json()));
  console.info(JSON.stringify({race:kind,pids:[a.pid,b.pid],statuses,publicStatuses:bodies.map(body=>body.status)}));
  assert.ok(statuses.includes(200),kind);assert.ok(statuses.every(s=>[200,409].includes(s)),kind);
  assert.equal(count(),before+1,kind+' exactly one decision/audit');
  if(kind.startsWith('same-')){
   const field=kind==='same-publication'?'value':'result';const recovered=await checked(await left(0));assert.deepEqual(recovered[field],bodies[statuses.indexOf(200)][field]);
   for(let i=0;i<2;i++)if(statuses[i]===200)assert.deepEqual(bodies[i][field],recovered[field]);
  }else assert.equal(statuses.filter(s=>s===200).length,1,kind);
  report.races.push({kind,pids:[a.pid,b.pid],statuses,decisionDelta:1});
 }
 report.auditCounts=[];report.upstreamDigests=[];
 for(const o of orders){
  assert.deepEqual(upstream(o),o.before);const count=audits(o);for(const row of count){assert.equal(row.count,row.audits);assert.equal(row.count,row.keys);}
  const text=sql("select coalesce(json_agg(result)::text,'[]') from local_commerce.fulfillment_decisions where order_id='"+o.id+"';");
  assert.doesNotMatch(text,/session_hash|capability_hash|object_locator|production-preview\/|service_role|cookie|password/i);
  assert.equal(sql("select count(*) from local_commerce.fulfillments where order_id='"+o.id+"';"),'1');
  for(const table of ['shipments','shipment_events'])assert.equal(sql("select count(*) from local_commerce."+table+" where order_id='"+o.id+"';"),'0');
  assert.equal(sql("select count(*) from local_commerce.fulfillments where order_id='"+o.id+"' and (revision_requests_used>2 or fulfillment_state in('in_production','quality_check'));"),'0');
  assert.equal(sql("select count(*) from local_commerce.preview_manifests where order_id='"+o.id+"' and manifest_version>3;"),'0');
  report.auditCounts.push({reference:o.publicReference,counts:count});report.upstreamDigests.push({reference:o.publicReference,digests:o.before});
 }
 report.status='PASS';report.classification='LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE';console.info(JSON.stringify(report));
}finally{for(const p of children.reverse())await stop(p);globalThis.fetch=actualFetch;}
