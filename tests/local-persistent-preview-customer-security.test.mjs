import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectPersistentCustomerPreview} from '../app/server/local-persistent-preview-customer.server.ts';
const reference='FM-LOCAL-0123456789ABCDEF';
const valid={publicReference:reference,status:'preview_pending',version:2,manifestId:'11111111-1111-4111-8111-111111111111',manifestVersion:1,revisionRequestsUsed:0,
 entries:[{previewMediaId:'22222222-2222-4222-8222-222222222222',contentType:'image/png',width:10,height:10}]};
test('customer preview projection allowlists safe metadata for v1/v2/v3',()=>{
 for(const manifestVersion of [1,2,3]){
  const value={...valid,manifestVersion,ownerId:'private',sessionHash:'private',entries:[{...valid.entries[0],object_locator:'private'}]};
  assert.deepEqual(projectPersistentCustomerPreview(value,reference),{...valid,manifestVersion});
 }
});
test('customer preview rejects foreign, malformed, unsupported or incomplete projections',()=>{
 for(const patch of [{publicReference:'FM-LOCAL-0000000000000000'},{manifestVersion:4},{manifestVersion:'1'},{entries:[]},{revisionRequestsUsed:3},{version:0},{status:'shipped'},
  {entries:[{...valid.entries[0],contentType:'text/html'}]}])assert.equal(projectPersistentCustomerPreview({...valid,...patch},reference),null);
});
test('candidate SQL binds aggregate CAS into both digest and explicit replay equivalence',()=>{
 const sql=readFileSync(new URL('../local/commerce/migrations/0022_local-commerce-customer-preview-decisions.sql',import.meta.url),'utf8');
 assert.match(sql,/manifest\.id,p_expected_preview_version,p_expected_aggregate_version,p_note/);
 assert.match(sql,/previous\.expected_aggregate_version is distinct from p_expected_aggregate_version/);
 assert.ok(sql.indexOf('read_order_history(')<sql.indexOf('select * into previous'));
 assert.ok(sql.indexOf('select * into previous')<sql.indexOf("aggregate.fulfillment_state<>'preview_pending'"));
});
test('operator adapter uses restricted target, never browser-selected manifest version',()=>{
 const source=readFileSync(new URL('../app/server/local-persistent-preview-media.server.ts',import.meta.url),'utf8');
 assert.match(source,/const targetManifestVersion=c\.targetManifestVersion/);
 assert.match(source,/manifestVersion:targetManifestVersion/);
 assert.match(source,/acquire\(e\.previewMediaId,targetManifestVersion\)/);
 assert.doesNotMatch(source,/manifestVersion:1|manifest_version!==1/);
 assert.ok(source.indexOf('command("probe_publish"')<source.indexOf('const artifacts:PersistentPreviewArtifact'));
});
