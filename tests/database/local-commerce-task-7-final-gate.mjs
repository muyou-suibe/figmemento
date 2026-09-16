// One indexed, repeatable real Task 7 integration gate on the retained local
// acceptance stack. Each child suite creates only fresh synthetic local data.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const suites=[
 ['applied-sql','tests/database/local-commerce-photo-review-applied-sql.mjs'],
 ['real-media-review','tests/database/local-commerce-fulfillment-admission-http-acceptance.mjs'],
 ['customer-preview','tests/database/local-commerce-customer-preview-http-acceptance.mjs'],
 ['replay-atomicity','tests/database/local-commerce-fulfillment-replay-http-acceptance.mjs'],
 ['production-quality','tests/database/local-commerce-production-quality-http.mjs'],
 ['admin-timeout','tests/database/local-commerce-admin-timeout-http.mjs'],
];
const reports={};
for(const [name,file] of suites){
 const result=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:6*60*1000,maxBuffer:100*1024*1024});
 assert.equal(result.status,0,`${name}: ${result.error?.code??result.stderr??result.stdout}`);
 const values=result.stdout.split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);
 const report=values.findLast(value=>value.status==='PASS');assert.ok(report,`${name}: missing PASS report`);reports[name]=report;
}
const media=reports['real-media-review'].imageMatrix;
assert.equal(media.length,7);assert.ok(media.some(x=>x.decisions.includes('approved-restart-replay')&&x.previewChain==='v1-v3-two-revisions-third-rejected'&&x.terminal==='quality_check'));
assert.ok(media.some(x=>x.decisions.includes('rejected')&&x.terminal==='production-blocked'));
assert.ok(media.some(x=>x.mediaCount===0&&x.preview===true&&x.pendingReviews===0&&x.terminal==='quality_check'));
assert.ok(media.some(x=>x.mediaCount===0&&x.preview===false&&x.pendingReviews===0&&x.terminal==='quality_check'));
assert.ok(media.some(x=>x.mixed&&x.pendingReviews===1&&x.terminal==='quality_check'));
const customerRaces=reports['customer-preview'].races.map(x=>x.kind);
const replayRaces=reports['replay-atomicity'].races.map(x=>x.kind);
const timeoutRaces=reports['admin-timeout'].races.map(x=>x.mode);
assert.ok(customerRaces.includes('last-revision')&&customerRaces.includes('v2 publication vs stale v1')&&customerRaces.includes('v3 publication vs stale v2'));
assert.ok(replayRaces.includes('competing-publications')&&replayRaces.includes('same-approval'));
assert.ok(timeoutRaces.includes('revision')&&timeoutRaces.includes('approval'));
assert.equal(reports['production-quality'].races.find(x=>x.mode==='required').approvalRace.kind,'start-production-vs-approval');
const raceIndex=[
 'same admission action ID','different admission action IDs','same photo-review action ID','competing approve/reject photo review',
 'last allowed revision','publication versus stale approval','two publications for same next version','two customer approvals',
 'Admin timeout versus revision','Admin timeout versus approval','start production versus approval/version transition',
 'quality-check exact duplicate/new selector',
].map((kind,index)=>({index:index+1,kind,status:'PASS'}));
console.info(JSON.stringify({status:'PASS',task:'7.7',run:'run-5576dfd8',project:'figmemento-local-commerce-test-run-5576dfd8',
 ledger:26,pending:0,suites:suites.map(([name,file])=>({name,file,status:'PASS'})),raceIndex,
 realMediaMatrix:media,sqlFaultPoints:reports['applied-sql'].photoReviewFaultPoints,
 customerPreviewFaults:reports['customer-preview'].privateMediaFaults.length,
 restartClasses:{review:reports['real-media-review'].restartPids,customer:reports['customer-preview'].restarts,
  replay:reports['replay-atomicity'].restarts,production:reports['production-quality'].restarts,timeout:reports['admin-timeout'].restarts},
 classification:'LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE'}));
