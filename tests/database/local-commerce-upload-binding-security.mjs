import assert from 'node:assert/strict';
import {createHmac, randomUUID} from 'node:crypto';

export async function verifyUploadBindingSecurity({c, prep, info, sql, keyDigest}) {
  const params = JSON.parse(sql(`select json_build_object('p_project_id',b.project_id,'p_marker_digest','${prep.markerDigest}',
    'p_owner_kind','guest','p_owner_selector',w.subject_hash,'p_customer_id',null,
    'p_authority_expires_at',clock_timestamp()+interval '10 minutes','p_draft_id',o.draft_id,'p_product_id',o.product_id,
    'p_expected_version',(b.command_context->>'expectedVersion')::integer,'p_key_digest',b.key_digest,
    'p_fingerprint',b.fingerprint,'p_recovery_only',true,'p_input',o.normalized_input)
    from local_commerce.media_upload_command_bindings b join local_commerce.media_operations o on o.project_id=b.project_id and o.id=b.operation_id
    join local_commerce.commerce_owners w on w.project_id=b.project_id and w.id=b.owner_id
    where b.project_id='${c.projectId}' and b.key_digest='${keyDigest}';`));
  const enc = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const signing = enc({alg:'HS256',typ:'JWT'}) + '.' + enc({role:'authenticated',sub:randomUUID(),aud:'authenticated',exp:Math.floor(Date.now()/1000)+600});
  const jwt = signing + '.' + createHmac('sha256', info.JWT_SECRET).update(signing).digest('base64url');
  for (const [role, token] of [['anon', info.ANON_KEY], ['authenticated', jwt]]) {
    assert.equal(sql(`select has_table_privilege('${role}','local_commerce.media_upload_command_bindings','SELECT,INSERT,UPDATE,DELETE');`), 'f');
    for (const method of ['GET','POST','PATCH','DELETE']) {
      const r = await fetch(c.endpoints.apiUrl+'/rest/v1/media_upload_command_bindings?key_digest=eq.'+keyDigest, {
        method, headers:{apikey:info.ANON_KEY,authorization:'Bearer '+token,'accept-profile':'local_commerce','content-profile':'local_commerce','content-type':'application/json'},
        ...(['POST','PATCH'].includes(method)?{body:'{}'}:{}), signal:AbortSignal.timeout(5000)});
      await r.arrayBuffer(); assert.ok([401,403].includes(r.status), role+' '+method);
      console.info('BINDING RLS HTTP DENIED', role, method, r.status);
    }
    const r = await fetch(c.endpoints.apiUrl+'/rest/v1/rpc/media_upload_command', {method:'POST',
      headers:{apikey:info.ANON_KEY,authorization:'Bearer '+token,'content-profile':'local_commerce','content-type':'application/json'},
      body:JSON.stringify(params),signal:AbortSignal.timeout(5000)});
    await r.arrayBuffer(); assert.ok([401,403].includes(r.status)); console.info('BINDING RPC HTTP DENIED',role,r.status);
  }
  const literal = value => "'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
  // Inject a transaction-local constraint for ONLY a new synthetic key. The
  // constraint and probe writes are rolled back; no persistent schema change.
  const faultKey = createHmac('sha256', randomUUID()).update('binding-fault').digest('hex');
  const authority = `'${c.projectId}','${prep.markerDigest}','guest','${params.p_owner_selector}',null,clock_timestamp()+interval '10 minutes'`;
  sql(`begin; do $probe$ declare r jsonb; begin
    r:=local_commerce.media_operation_command(${authority},'begin',null,'${params.p_draft_id}',null,${params.p_expected_version},${literal(params.p_input)});
    if r->>'status'<>'found' then raise exception 'failure probe must reach binding insert'; end if;
    end $probe$; rollback;`);
  sql(`begin; set local lock_timeout='2s'; set local statement_timeout='5s';
    alter table local_commerce.media_upload_command_bindings add constraint acceptance_binding_fault check(key_digest<>'${faultKey}') not valid;
    do $probe$ declare r jsonb; n bigint; b bigint; begin
    select count(*) into n from local_commerce.media_operations where project_id='${c.projectId}' and draft_id='${params.p_draft_id}';
    select count(*) into b from local_commerce.media_upload_command_bindings where project_id='${c.projectId}';
    r:=local_commerce.media_upload_command(${authority},'${params.p_draft_id}','${params.p_product_id}',${params.p_expected_version},'${faultKey}',repeat('b',64),false,${literal(params.p_input)});
    if r->>'status'<>'unavailable' or n<>(select count(*) from local_commerce.media_operations where project_id='${c.projectId}' and draft_id='${params.p_draft_id}')
      or b<>(select count(*) from local_commerce.media_upload_command_bindings where project_id='${c.projectId}') then raise exception 'atomic rollback failed'; end if;
    end $probe$; rollback;`);
  assert.equal(sql("select count(*) from pg_constraint where conname='acceptance_binding_fault';"), '0');
  console.info('ATOMIC BEGIN/BINDING REAL CONSTRAINT ROLLBACK PASS: no orphan operation or binding');
}
