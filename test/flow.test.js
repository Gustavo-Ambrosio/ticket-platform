import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{hmac} from '../src/worker.js';
import {database} from '../scripts/database.js';
test('fluxo completo: reserva, webhook, ingresso privado, check-in único e reembolso',async()=>{
 const db=database();const env={DB:db,SALES_ENABLED:'true',MP_ACCESS_TOKEN:'test',MP_WEBHOOK_SECRET:'webhook-secret',MP_ENV:'test',ADMIN_PASSWORD:'admin-password',SESSION_SECRET:'session-secret',APP_URL:'https://test.example',LOCAL_QR:async()=>'<svg></svg>'};
 db.sqlite.exec("UPDATE events SET demo=0; UPDATE lots SET capacity=2 WHERE id='raiz';");
 const originalFetch=globalThis.fetch;let payment;
 globalThis.fetch=async(url,opts)=>{
  if(String(url).endsWith('/checkout/preferences')){const p=JSON.parse(opts.body);assert.equal(p.items[0].unit_price,60);payment={id:12345,external_reference:p.external_reference,transaction_amount:120,currency_id:'BRL',live_mode:false,status:'approved'};return Response.json({id:'pref-1',init_point:'https://pay.example/live',sandbox_init_point:'https://pay.example/test'});}
  if(String(url).includes('/v1/payments/'))return Response.json(payment);
  throw new Error('Unexpected fetch '+url);
 };
 const request=(path,method='GET',data,headers={})=>new Request(env.APP_URL+path,{method,headers:{Origin:env.APP_URL,'Content-Type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})});
 try{
  let response=await worker.fetch(request('/api/checkout','POST',{lotId:'raiz',quantity:2,name:'Pessoa Teste',email:'pessoa@example.com',price:1}),env);
  assert.equal(response.status,201);const result=await response.json();assert.equal(result.checkout_url,'https://pay.example/test');
  const [id,token]=new URL(result.order_url).hash.slice(1).split('/');
  response=await worker.fetch(request('/api/orders/'+id),env);assert.equal(response.status,404);
  response=await worker.fetch(request('/api/events'),env);const events=await response.json();assert.equal(events.events[0].lots[0].remaining,0);assert.equal(events.events[0].lots[1].active,true);
  const headers={Authorization:'Bearer '+token};response=await worker.fetch(request('/api/orders/'+id,'GET',null,headers),env);assert.equal((await response.json()).tickets.length,0);
  const ts='1742505638683',requestId='req-1',signature=await hmac(env.MP_WEBHOOK_SECRET,`id:12345;request-id:${requestId};ts:${ts};`);
  const notify=()=>worker.fetch(request('/api/webhooks/mercadopago?data.id=12345','POST',{type:'payment',data:{id:12345}},{'x-signature':`ts=${ts},v1=${signature}`,'x-request-id':requestId}),env);
  assert.equal((await notify()).status,200);assert.equal((await notify()).status,200);
  response=await worker.fetch(request('/api/orders/'+id,'GET',null,headers),env);const order=await response.json();assert.equal(order.status,'paid');assert.equal(order.tickets.length,2);
  response=await worker.fetch(request('/api/orders/'+id+'/qr/'+order.tickets[0].code,'GET',null,headers),env);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/svg+xml');
  response=await worker.fetch(request('/api/admin/login','POST',{password:env.ADMIN_PASSWORD}),env);assert.equal(response.status,200);const cookie=response.headers.get('Set-Cookie').split(';')[0];
  response=await worker.fetch(request('/api/admin/checkin','POST',{code:order.tickets[0].code},{Cookie:cookie}),env);assert.equal(response.status,200);
  response=await worker.fetch(request('/api/admin/checkin','POST',{code:order.tickets[0].code},{Cookie:cookie}),env);assert.equal(response.status,409);
  payment.status='refunded';assert.equal((await notify()).status,200);
  response=await worker.fetch(request('/api/admin/checkin','POST',{code:order.tickets[1].code},{Cookie:cookie}),env);assert.equal(response.status,409);
 }finally{globalThis.fetch=originalFetch;db.sqlite.close();}
});
test('evento demonstrativo nunca permite pagamento mesmo com vendas ativadas',async()=>{
 const env={DB:database(),SALES_ENABLED:'true',MP_ACCESS_TOKEN:'x',MP_WEBHOOK_SECRET:'x',SESSION_SECRET:'x'};
 const r=await worker.fetch(new Request('https://test.example/api/checkout',{method:'POST',headers:{Origin:'https://test.example'},body:JSON.stringify({lotId:'raiz',quantity:1,name:'Pessoa Teste',email:'teste@example.com'})}),env);assert.equal(r.status,403);env.DB.sqlite.close();
});
