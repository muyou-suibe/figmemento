// Exact accepted synthetic fixture; row locks only, both transactions roll back.
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const db='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
const project='figmemento-local-commerce-test-run-5576dfd8';
const dir=process.cwd()+'/local/commerce/runtime/disposable/run-5576dfd8';
const prep=JSON.parse(readFileSync(dir+'/ledger-preparation.json'));
function run(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:15000});assert.equal(r.status,0,'bounded Docker command');return r.stdout.trim();}
const c=JSON.parse(run(['inspect',db]))[0];assert.equal(c.Id,db);assert.equal(c.Config.Labels['com.supabase.cli.workdir'],dir);assert.equal(c.State.Status,'running');assert.equal(prep.config.projectId,project);
const args=['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'];
assert.equal(run(args,`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),'t');
const p=JSON.parse(run(args,`select json_build_object('id',o.id,'selector',w.subject_hash,'cap',g.capability_hash,'expires',g.expires_at) from local_commerce.orders o join local_commerce.commerce_owners w on w.id=o.owner_id and w.project_id=o.project_id join local_commerce.access_grants g on g.resource_id=o.id and g.project_id=o.project_id where o.public_reference='FM-LOCAL-1C5296C6C71A4AA2' and o.project_id='${project}' and w.owner_kind='guest' and g.resource_kind='local_order' and g.lifecycle='active' limit 1;`));
const clients=[0,1].map(i=>{const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});const x={child,out:'',err:'',i};child.stdout.on('data',b=>x.out+=b);child.stderr.on('data',b=>x.err+=b);return x;});
const deadline=Date.now()+12000;
try{
 for(const x of clients)x.child.stdin.write(`begin;set local statement_timeout='5000ms';select id from local_commerce.orders where id='${p.id}' for share;\n\\echo LOCKED\n`);
 while(!clients.every(x=>x.out.includes('LOCKED'))){assert.ok(Date.now()<deadline,'lock barrier timeout');await new Promise(r=>setTimeout(r,20));}
 const done=clients.map(x=>new Promise(r=>x.child.on('close',r)));
 for(const x of clients)x.child.stdin.end(`select local_commerce.fulfillment_customer_command('${project}','${prep.markerDigest}','guest','${p.selector}',null,null,'${p.expires}','${p.cap}','FM-LOCAL-1C5296C6C71A4AA2','prepare',null,null,'',null);rollback;`);
 await Promise.all(done);
 const results=clients.map(x=>({process:x.i,exit:x.child.exitCode,status:JSON.parse(x.out.split('\n').find(l=>l.startsWith('{'))).status}));
 for(const r of results){assert.equal(r.exit,0);assert.equal(r.status,'found');}
 console.info(JSON.stringify({status:'PASS',classification:'two simultaneous shared-lock holders; prepare does not upgrade',results,mutation:'NONE'}));
}finally{for(const x of clients)if(x.child.exitCode===null)x.child.kill('SIGTERM');}
