// Fresh process: receives synthetic credentials over private stdin, never logs them.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {readPersistentOrderHistory,readPersistentOrderHistoryModel} from '../../app/server/local-persistent-order-history.server.ts';
import {LocalCatalogAuthority} from '../../app/infrastructure/local-commerce/local-catalog-authority.server.ts';
import {LocalMemoryLocalOrderRepository} from '../../app/infrastructure/local-order/local-memory-local-order-repository.server.ts';
import {LocalMemoryLocalSupplierWorkOrderRepository} from '../../app/infrastructure/suppliers/local-memory-local-supplier-work-order-repository.server.ts';
import {LocalMemoryLocalSupplierAssignmentRepository} from '../../app/infrastructure/suppliers/local-memory-local-supplier-assignment-repository.server.ts';
import {LocalMemoryLocalSupplierProductionRepository} from '../../app/infrastructure/suppliers/local-memory-local-supplier-production-repository.server.ts';
import {projectHistoryForAdmin,projectHistoryForFulfillment,projectHistoryForTracking,projectHistoryForDelivery,projectHistoryForSupplier} from '../../app/application/local-order-consumer-projections.server.ts';
const input=JSON.parse(readFileSync(0,'utf8'));
assert.match(input.environment.LOCAL_COMMERCE_RUN_ID,/^run-[a-f0-9]{8}$/);
assert.equal(
 input.environment.LOCAL_COMMERCE_PROJECT_ID,
 `figmemento-local-commerce-test-${input.environment.LOCAL_COMMERCE_RUN_ID}`,
);
let catalog=0,storage=0,memoryOrder=0,supplier=0;
for(const [prototype,fail] of [
 [LocalMemoryLocalOrderRepository.prototype,()=>{memoryOrder++;throw Error('Forbidden memory Order history');}],
 ...[LocalMemoryLocalSupplierWorkOrderRepository,LocalMemoryLocalSupplierAssignmentRepository,LocalMemoryLocalSupplierProductionRepository].map(c=>[c.prototype,()=>{supplier++;throw Error('Forbidden Supplier history');}]),
]) for(const name of Object.getOwnPropertyNames(prototype)) {
 if(name!=='constructor'&&typeof prototype[name]==='function')prototype[name]=fail;
}
LocalCatalogAuthority.prototype.readSnapshot=async()=>{catalog++;throw Error('Forbidden historical Catalog reconstruction');};
const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 const u=new URL(typeof url==='string'?url:url.url??url.href);
 assert.equal(u.hostname,'127.0.0.1');
 if(u.pathname.includes('/storage/v1/')){storage++;throw Error('Forbidden historical Storage reconstruction');}
 if(u.pathname.includes('read_catalog_authority')||u.pathname.includes('/catalog_')){catalog++;throw Error('Forbidden historical Catalog RPC');}
 if(u.pathname.includes('supplier')){supplier++;throw Error('Forbidden historical Supplier RPC');}
 return original(url,options);
};
const request=new Request('http://127.0.0.1:56727/',{headers:{cookie:input.cookie}});
const canonical=await readPersistentOrderHistory(request,input.selector,input.environment);
const summary=await readPersistentOrderHistory(request,{publicReference:input.selector.publicReference},input.environment);
const model=await readPersistentOrderHistoryModel(request,input.selector,input.environment);
const projections=model.status==='found'?Object.fromEntries([
 ['admin',projectHistoryForAdmin],['fulfillment',projectHistoryForFulfillment],['tracking',projectHistoryForTracking],['delivery',projectHistoryForDelivery],['supplier',projectHistoryForSupplier],
].map(([k,f])=>[k,f(model.value)])):null;
assert.equal(catalog,0);assert.equal(storage,0);assert.equal(supplier,0);assert.equal(memoryOrder,0);
process.stdout.write(JSON.stringify({pid:process.pid,canonical,summary,model,projections,catalog,storage,supplier,memoryOrder}));
