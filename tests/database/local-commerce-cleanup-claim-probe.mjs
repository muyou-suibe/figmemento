// Independent acceptance process. Claim only: never a Storage request or DELETE.
import assert from 'node:assert/strict';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {api,headers,args}=JSON.parse(input);
const u=new URL(api);assert.equal(u.hostname,'127.0.0.1');assert.match(u.port,/^\d{2,5}$/);
assert.match(process.env.LOCAL_COMMERCE_RUN_ID??'',/^run-[a-f0-9]{8}$/);
assert.equal(args.p_project_id,`figmemento-local-commerce-test-${process.env.LOCAL_COMMERCE_RUN_ID}`);
assert.match(args.p_marker_digest,/^[a-f0-9]{64}$/);
assert.equal(args.p_command,'claim');assert.equal(args.p_resource,'original');assert.equal(args.p_lease_token,null);
assert.match(args.p_operation_id,/^[a-f0-9-]{36}$/);
const r=await fetch(api+'/rest/v1/rpc/media_cleanup_command',{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(5000)});
assert.equal(r.status,200);const value=await r.json();
// No locator, lease credential or private data in the report.
console.info(JSON.stringify({pid:process.pid,status:value.status,http:r.status,storageRequests:0}));
