import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const read=p=>readFileSync(p,'utf8');
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
const modules=[...walk('app/order'),...walk('app/api/local-orders'),...walk('app/api/local-payments'),
 'app/storefront/LocalOrderSuccessExperience.tsx','app/storefront/LocalCheckoutExperience.tsx',
 'app/api/orders/route.ts','app/api/webhooks/stripe/route.ts',
 ...readdirSync('app/server').filter(p=>/^local-(order|payment).*\.ts$/.test(p)).map(p=>'app/server/'+p),
 'app/application/local-order-creation.ts','app/application/local-payment-service.ts'];

test('current Order creation/success and payment modules have no Cart mutation calls or persistent DB seam',()=>{
 for(const file of modules){
  const source=read(file),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(node){
   if(ts.isCallExpression(node)){
    const callee=node.expression.getText(ast);
    assert.doesNotMatch(callee,/(?:^|\.)(?:clear|clearCart|addLine|updateLine|removeLine|deleteCart|deleteCartLine)$/i,file+': '+callee);
    if(callee==='fetch'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='/api/cart'){
     const options=node.arguments[1];
     assert.ok(options&&ts.isObjectLiteralExpression(options),'Cart fetch options must be auditable');
     assert.ok(options.properties.every(p=>ts.isPropertyAssignment(p)),'no opaque options spread');
     const method=options.properties.find(p=>p.name.getText(ast)==='method');
     assert.ok(!method||(ts.isStringLiteral(method.initializer)&&method.initializer.text==='GET'),'only read-only Cart fetch');
    }
   }
   if(ts.isStringLiteral(node)){
    assert.doesNotMatch(node.text,/local-persistent-cart|local-persistent-supabase-adapter|cart_command|local_commerce\.(?:carts|cart_lines)/,file);
    assert.doesNotMatch(node.text,/^(?:carts|cart_lines)$/,file);
   }
   ts.forEachChild(node,visit);
  }
  visit(ast);
 }
});

test('Order evaluation consumes only the read-only Cart contract',()=>{
 const evaluator=read('app/application/local-checkout-evaluator.ts');
 assert.match(evaluator,/cartReader: Pick<ShoppingCartProvider, "getCart">/);
 const ast=ts.createSourceFile('evaluator.ts',evaluator,ts.ScriptTarget.Latest,true);const uses=[];
 function visit(node){if(ts.isPropertyAccessExpression(node)&&node.expression.getText(ast)==='dependencies.cartReader')uses.push(node.name.text);ts.forEachChild(node,visit);}
 visit(ast);assert.deepEqual(uses,['getCart']);
});

test('persistent clear is exposed through explicit Cart mutation, not success navigation',()=>{
 const route=read('app/api/cart/route.ts');
 assert.match(route,/export async function DELETE/);assert.match(route,/persistentCartHttp\(request, "clear"\)/);
 const handler=read('app/server/local-persistent-cart-http.server.ts');
 assert.match(handler,/isSameOriginCartMutation/);assert.match(handler,/port.clear\(/);
 assert.match(handler,/expectedVersion: current.value.version/);
 const adapter=read('app/infrastructure/local-commerce/local-persistent-cart-adapter.server.ts');
 assert.match(adapter,/clear: command => store.execute\(\{ \.\.\.command, operation: "clear" \}\)/);
});

test('no fake persistent Order endpoint is introduced; canonical transaction retention remains Task 6.2',()=>{
 assert.match(read('app/server/local-order-http.server.ts'),/configuration.source !== "local_fake"/);
 const tasks=read('openspec/changes/complete-local-commerce-persistence/tasks.md');
 assert.match(tasks,/- \[x\] 6\.2 .*保留 Cart 行\/数量/);
});
