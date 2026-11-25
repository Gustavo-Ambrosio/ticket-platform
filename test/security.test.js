import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{hmac,verifyWebhook,validateBuyer,validatePayment} from '../src/worker.js';
test('webhook exige assinatura e vincula ID, request ID e timestamp',async()=>{
 const secret='a-secret',ts=String(Date.now()),id='123456',requestId='request-abc';const signature=await hmac(secret,`id:${id};request-id:${requestId};ts:${ts};`);
 const r=new Request(`https://tickets.example/api/webhooks/mercadopago?data.id=${id}`,{headers:{'x-signature':`ts=${ts},v1=${signature}`,'x-request-id':requestId}});
 assert.equal(await verifyWebhook(r,secret),true);assert.equal(await verifyWebhook(r,'wrong'),false);
 assert.equal(await verifyWebhook(new Request('https://tickets.example?data.id=999',{headers:r.headers}),secret),false);
 assert.equal(await verifyWebhook(new Request('https://tickets.example'),secret),false);
});
test('preço do cliente não participa da validação do pagamento',()=>{
 const order={id:'order-1',amount_cents:12000};const p={external_reference:'order-1',transaction_amount:120,currency_id:'BRL',live_mode:false};
 assert.equal(validatePayment(order,p,{MP_ENV:'test'}),true);
 for(const changed of [{transaction_amount:1},{external_reference:'other'},{currency_id:'USD'},{live_mode:true}])assert.equal(validatePayment(order,{...p,...changed},{MP_ENV:'test'}),false);
});
test('comprador exige dados válidos e quantidade inteira entre 1 e 6',()=>{
 const valid={name:'  Pessoa Teste  ',email:'Pessoa@Example.com',quantity:2,lotId:'raiz'};
 assert.equal(validateBuyer(valid).name,'Pessoa Teste');assert.equal(validateBuyer(valid).email,'pessoa@example.com');
 for(const d of [{quantity:0},{quantity:7},{quantity:1.2},{quantity:'2'},{name:'a'},{email:'invalid'},null])assert.throws(()=>validateBuyer(d===null?d:{...valid,...d}));
});
test('vendas desativadas e CSRF impedem criação de pedido',async()=>{
 let r=await worker.fetch(new Request('https://tickets.example/api/checkout',{method:'POST',headers:{Origin:'https://tickets.example'},body:'{}'}),{DB:{},SALES_ENABLED:'false'});assert.equal(r.status,503);
 r=await worker.fetch(new Request('https://tickets.example/api/checkout',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),{DB:{}});assert.equal(r.status,403);
});
test('painel e dados privados não abrem sem autenticação',async()=>{
 const r=await worker.fetch(new Request('https://tickets.example/api/admin/overview'),{ADMIN_PASSWORD:'secret',SESSION_SECRET:'secret',DB:{}});assert.equal(r.status,401);
 assert.equal(r.headers.get('Cache-Control'),'no-store');
});
