import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {ledgerWrappers} from '../scripts/local-commerce-ledger-wrapper.mjs';
import {planMigrationLedger} from '../app/application/local-commerce-migration-ledger.ts';
const m=JSON.parse(readFileSync('local/commerce/migrations/manifest.json','utf8'));
const sources=m.migrations.map(x=>readFileSync('local/commerce/migrations/'+x.filename,'utf8'));
const project='figmemento-local-commerce-test-run-a123bc45';
test('each verified SQL and ledger row share one transaction in disposable wrappers',()=>{
 const w=ledgerWrappers(m,sources,project,'a'.repeat(64));assert.equal(w.length,m.migrations.length);
 for(const [i,sql] of w.entries()) {assert.equal((sql.match(/^begin;$/gm)||[]).length,1);assert.equal((sql.match(/^commit;$/gm)||[]).length,1);assert.ok(sql.indexOf('insert into local_commerce.migration_ledger')<sql.lastIndexOf('commit;'));assert.ok(sql.includes(m.migrations[i].checksum));assert.doesNotMatch(sql,/supabase_migrations/);}
});
test('checksum and retained/invalid identity reject wrapper generation',()=>{
 assert.throws(()=>ledgerWrappers(m,[sources[0]+' ',...sources.slice(1)],project,'a'.repeat(64)));
 assert.throws(()=>ledgerWrappers(m,sources,'figmemento-local-commerce','a'.repeat(64)));
});
test('ledger planner rejects gaps, wrong checksum and project instead of filling history',()=>{
 const manifest={...m,projectId:project};const applied=m.migrations.map(e=>({...e,projectId:project}));
 assert.equal(planMigrationLedger(manifest,applied,project).skipped.length,m.migrations.length);
 for(const a of [applied.slice(1),[{...applied[0],checksum:'0'.repeat(64)}],[{...applied[0],projectId:'other'}]])assert.equal(planMigrationLedger(manifest,a,project).status,'blocked');
});
