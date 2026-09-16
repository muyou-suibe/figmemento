import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parsePersistentOrderStructuralInput as parse,persistentOrderCreationContext as context} from '../app/application/local-order-creation-context.server.ts';
import {localOrderPurchaseVersions as versions} from '../app/application/local-order-purchase-versions.server.ts';
import {LocalCatalogAuthority} from '../app/infrastructure/local-commerce/local-catalog-authority.server.ts';
import {catalogTestEnvironment as env,offlineCatalogClient,ids} from './fixtures/local-persistent-catalog.mjs';

test('canonical replay context ignores object property order, normalizes structure and binds every owner/Cart/selector change',async()=>{
  const raw={email:' test@example.test ',country:'us',creationAttemptId:'attempt-1234567890',couponCode:'CODE'};
  const input=parse(raw),owner={kind:'guest',projectId:'project',ownerId:'opaque-owner',expiresAt:1000};
  const original=await context(input,owner,'cart',2);
  assert.deepEqual(await context(parse({...raw,country:'US',email:'test@example.test'}),owner,'cart',2),original);
  for(const [i,o,c,v] of [[parse({...raw,email:'other@example.test'}),owner,'cart',2],[parse({...raw,couponCode:'OTHER'}),owner,'cart',2],
    [input,{...owner,ownerId:'other'},'cart',2],[input,owner,'other',2],[input,owner,'cart',3]])assert.notEqual((await context(i,o,c,v)).contextDigest,original.contextDigest);
  assert.equal(parse({...raw,p_capability_hash:'a'.repeat(64)}),null);
  assert.equal(parse({...raw,price:5}),null);
});

test('purchase version set contains only exact purchase rows and applicable matching rules',async()=>{
  const snapshot=await new LocalCatalogAuthority(env(),offlineCatalogClient()).readSnapshot();assert.equal(snapshot.status,'found');
  const base={catalog:snapshot.value.dataSet,configurations:snapshot.value.configurations,rules:snapshot.value.rules,
    versions:snapshot.value.versions,selections:[{productId:ids.product,variantId:ids.variant}],requiresShipping:false,method:'',couponCode:''};
  const noRules=versions(base);assert.ok(noRules);assert.ok(!Object.keys(noRules).some(k=>k.startsWith('rules:')));
  assert.deepEqual(versions({...base,couponCode:'NO_MATCH'}),noRules);
  assert.deepEqual(versions({...base,versions:{...base.versions,'products:unrelated':99}}),noRules);
  assert.ok(Object.keys(versions({...base,couponCode:'TEST10'})).some(k=>k.startsWith('rules:')));
  const stale={...base.versions};delete stale[`variants:${ids.variant}`];assert.equal(versions({...base,versions:stale}),null);
});

test('0014 expiry signatures, probe-first, exact facts and retention are pre-apply contracts',()=>{
  const sql=readFileSync('local/commerce/migrations/0014_local-commerce-order-commit.sql','utf8');
  assert.match(sql,/p_capability_expires_at timestamptz/);
  assert.match(sql,/p_grant_expires_at>p_capability_expires_at/);
  assert.match(sql,/p_grant_expires_at>session_expiry/);
  assert.doesNotMatch(sql,/interval '30 days'|update\s+local_commerce\.carts\b|delete\s+from\s+local_commerce\.cart_lines\b|selectedSpecificationKey/i);
  assert.match(sql,/expected_media is distinct from item->'media'/);
  assert.match(sql,/expected_options is distinct from item->'selectedOptions'/);
  assert.match(sql,/expected_allocations is distinct from jsonb_path_query_array/);
  assert.match(sql,/customizationPriceComponents/);
  assert.match(sql,/notify pgrst, 'reload schema'/);
  const signature='text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb';
  assert.ok(sql.includes(`revoke all on function local_commerce.order_commit(${signature}) from public,anon,authenticated`));
  assert.ok(sql.includes(`grant execute on function local_commerce.order_commit(${signature}) to service_role`));
  const http=readFileSync('app/server/local-persistent-order-http.server.ts','utf8');
  assert.ok(http.indexOf('p_operation: "probe"')<http.indexOf('catalog.readSnapshot()'));
});
