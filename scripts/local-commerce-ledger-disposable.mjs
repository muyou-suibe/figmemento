import {readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLocalCommerceConfig, createProjectMarker} from '../app/application/local-commerce-environment.ts';
import {sha256Text, planMigrationLedger} from '../app/application/local-commerce-migration-ledger.ts';
import {ledgerWrappers, literal} from './local-commerce-ledger-wrapper.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const selected=readLocalCommerceConfig(process.env);
if(selected.status!=='ready' || selected.config.projectKind!=='disposable_test' || selected.config.environment!=='test' || process.env.NODE_ENV!=='test') throw Error('Disposable test environment required');
const c=selected.config;
const dir=path.join(root,'local/commerce/runtime/disposable',c.runId);
const manifest=JSON.parse(readFileSync(path.join(root,'local/commerce/migrations/manifest.json'),'utf8'));
const sources=manifest.migrations.map(m=>readFileSync(path.join(root,'local/commerce/migrations',m.filename),'utf8'));
const command=process.argv[2];
if(command==='prepare') {
  if(!process.argv.includes('--confirm-new-project') || existsSync(dir)) throw Error('New unique confirmed run required');
  const marker=createProjectMarker(c,new Date().toISOString());
  const digest=sha256Text(JSON.stringify(marker));
  const wrappers=ledgerWrappers(manifest,sources,c.projectId,digest);
  let config=readFileSync(path.join(root,'local/commerce/supabase/config.toml'),'utf8').replace(/^project_id = .*$/m,`project_id = "${c.projectId}"`);
  for(const [oldPort,port] of [[55420,c.ports.shadowDb],[55421,c.ports.api],[55422,c.ports.db],[55423,c.ports.studio],[55424,c.ports.smtp]]) config=config.replaceAll(String(oldPort),String(port));
  // CLI default analytics binds shared 54327; not required by this acceptance.
  config+='\n[analytics]\nenabled = false\n';
  mkdirSync(path.join(dir,'supabase/migrations'),{recursive:true});
  writeFileSync(path.join(dir,'supabase/config.toml'),config,{flag:'wx'});
  writeFileSync(path.join(dir,'project-marker.json'),JSON.stringify(marker,null,2)+'\n',{flag:'wx'});
  wrappers.forEach((sql,i)=>writeFileSync(path.join(dir,'supabase/migrations',manifest.migrations[i].filename),sql,{flag:'wx'}));
  writeFileSync(path.join(dir,'ledger-preparation.json'),JSON.stringify({config:c,markerDigest:digest,wrapperChecksums:wrappers.map(sha256Text)},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:'prepared',runId:c.runId,projectId:c.projectId,ports:c.ports}));
} else {
  const prepared=JSON.parse(readFileSync(path.join(dir,'ledger-preparation.json'),'utf8'));
  if(JSON.stringify(prepared.config)!==JSON.stringify(c)) throw Error('Prepared configuration mismatch');
  const marker=JSON.parse(readFileSync(path.join(dir,'project-marker.json'),'utf8'));
  if(sha256Text(JSON.stringify(marker))!==prepared.markerDigest || marker.projectId!==c.projectId) throw Error('Marker mismatch');
  const wrappers=ledgerWrappers(manifest,sources,c.projectId,prepared.markerDigest);
  if(readdirSync(path.join(dir,'supabase/migrations')).length!==wrappers.length) throw Error('Unexpected migration files');
  wrappers.forEach((sql,i)=>{if(sha256Text(sql)!==prepared.wrapperChecksums[i] || sql!==readFileSync(path.join(dir,'supabase/migrations',manifest.migrations[i].filename),'utf8')) throw Error('Wrapper mismatch');});
  if(command==='start') {
    if(!process.argv.includes('--confirm-new-project')) throw Error('Explicit first-start confirmation required');
    // Existing stack manager performs exact project and whole-port preflight.
    const r=spawnSync(process.execPath,[path.join(root,'scripts/local-commerce-stack.mjs'),'start'],{env:{...process.env,LOCAL_COMMERCE_WORKDIR:dir,LOCAL_COMMERCE_MARKER_PATH:path.join(dir,'project-marker.json')},stdio:'inherit'});
    process.exitCode=r.status??1;
  } else if(command==='plan') {
    // Resolve the exact CLI-reported container, never infer from a truncated name.
    const containers=spawnSync('docker',['ps','--filter',`label=com.supabase.cli.workdir=${dir}`,'--format','{{.Names}}'],{encoding:'utf8'});
    const names=containers.stdout.trim().split('\n').filter(n=>n.startsWith('supabase_db_'));
    if(containers.status!==0 || names.length!==1) throw Error('Exact project DB container unavailable');
    const identity=spawnSync('docker',['exec',names[0],'psql','-U','postgres','-d','postgres','-Atc',`select local_commerce.verify_project_identity(${literal(c.projectId)},${literal(prepared.markerDigest)});`],{encoding:'utf8'});
    if(identity.status!==0 || identity.stdout.trim()!=='t') throw Error('Database marker mismatch');
    const query=`select coalesce(json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version),'[]') from local_commerce.migration_ledger;`;
    const r=spawnSync('docker',['exec',names[0],'psql','-U','postgres','-d','postgres','-Atc',query],{encoding:'utf8'});
    if(r.status!==0) throw Error('Ledger unavailable');
    const p=planMigrationLedger({...manifest,projectId:c.projectId},JSON.parse(r.stdout),c.projectId);
    if(p.status!=='ready') throw Error(p.code);
    console.log(JSON.stringify({status:'ready',apply:p.apply.length,skip:p.skipped.length,projectId:c.projectId}));
  } else throw Error('Use prepare/start/plan');
}
