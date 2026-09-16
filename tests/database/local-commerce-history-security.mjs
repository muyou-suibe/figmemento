import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
export async function verifyHistorySecurity({sql,info,api,base}) {
 const sig='local_commerce.read_order_history(text,text,text,text,uuid,text,timestamptz,text,uuid,text,uuid,text)';
 assert.equal(sql(`select exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='${sig}'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE');`),'f');
 for(const role of ['anon','authenticated'])assert.equal(sql(`select has_function_privilege('${role}','${sig}','EXECUTE');`),'f');
 assert.equal(sql(`select has_function_privilege('service_role','${sig}','EXECUTE');`),'t');
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const signing=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'authenticated',sub:randomUUID(),aud:'authenticated',exp:Math.floor(Date.now()/1000)+600});
 assert.ok(info.JWT_SECRET);const jwt=signing+'.'+createHmac('sha256',info.JWT_SECRET).update(signing).digest('base64url');
 const http=(token,path,body)=>fetch(api+'/rest/v1/'+path,{method:body?'POST':'GET',headers:{apikey:info.ANON_KEY,authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Profile':'local_commerce','Accept-Profile':'local_commerce'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
 const evidence=[];
 for(const [role,token] of [['anon',info.ANON_KEY],['authenticated',jwt]]) {
  for(const table of ['orders','order_purchase_snapshots','order_items','order_item_purchase_snapshots','order_item_receipt_bindings','access_grants']){
   const r=await http(token,table+'?limit=0');assert.ok([401,403].includes(r.status));await r.arrayBuffer();evidence.push({role,table,status:r.status});
  }
  const r=await http(token,'rpc/read_order_history',base);assert.ok([401,403].includes(r.status));await r.arrayBuffer();evidence.push({role,rpc:'read_order_history',status:r.status});
 }
 const valid=await http(info.SERVICE_ROLE_KEY,'rpc/read_order_history',base);assert.equal(valid.status,200);assert.equal((await valid.json()).status,'found');
 for(const patch of [{p_project_id:'invalid-project'},{p_marker_digest:'0'.repeat(64)},{p_owner_selector:'0'.repeat(64)},
  {p_public_reference:'FM-LOCAL-0000000000000000'},{p_order_id:randomUUID()},{p_order_item_id:randomUUID()},
  {p_capability_hash:'0'.repeat(64)},{p_owner_kind:'operator'},{p_projection:'invalid'},{p_authority_expires_at:'2000-01-01T00:00:00Z'}]){
  const r=await http(info.SERVICE_ROLE_KEY,'rpc/read_order_history',{...base,...patch});assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'unavailable'});
 }
 console.info('6.5 REAL ACL / JWT / TABLE / RPC SECURITY PASS',JSON.stringify({evidence,foreignSelectorCases:10}));
}
