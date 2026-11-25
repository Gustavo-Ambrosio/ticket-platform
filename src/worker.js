const encoder = new TextEncoder();
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
async function body(request) {
 if (Number(request.headers.get('Content-Length') || 0) > 10000) fail(413, 'Solicitação muito grande.');
 const reader=request.body?.getReader(); let text='';
 if(reader){const decoder=new TextDecoder();while(true){const {value,done}=await reader.read();if(done)break;text+=decoder.decode(value,{stream:true});if(text.length>10000){await reader.cancel();fail(413,'Solicitação muito grande.');}}text+=decoder.decode();}
 try { return JSON.parse(text); } catch { fail(400, 'Dados inválidos.'); }
}
export async function hmac(secret, text) {
 const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function equal(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
export async function verifyWebhook(request, secret) {
 if (!secret) return false;
 const p = Object.fromEntries((request.headers.get('x-signature') || '').split(',').map(v => v.trim().split('=')));
 const id = new URL(request.url).searchParams.get('data.id')?.toLowerCase(), requestId = request.headers.get('x-request-id');
 if (!id || !requestId || !/^\d+$/.test(p.ts || '') || !/^[a-f0-9]{64}$/i.test(p.v1 || '')) return false;
 return equal(await hmac(secret, `id:${id};request-id:${requestId};ts:${p.ts};`), p.v1.toLowerCase());
}
export function validateBuyer(d) {
 if (!d || typeof d.name !== 'string' || d.name.trim().length < 3 || d.name.length > 120) fail(400, 'Informe seu nome completo.');
 if (typeof d.email !== 'string' || d.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) fail(400, 'Informe um e-mail válido.');
 if (!Number.isInteger(d.quantity) || d.quantity < 1 || d.quantity > 6) fail(400, 'Selecione de 1 a 6 ingressos.');
 if (typeof d.lotId !== 'string' || d.lotId.length > 100) fail(400, 'Lote inválido.');
 return { ...d, name: d.name.trim(), email: d.email.trim().toLowerCase() };
}
function checkOrigin(request) { if (request.headers.get('Origin') !== new URL(request.url).origin) fail(403, 'Origem não autorizada.'); }
function assertDB(env) { if (!env.DB) fail(503, 'Banco de dados ainda não configurado.'); }
async function rateLimit(request,env,scope,max){
 const ip=request.headers.get('CF-Connecting-IP')||'local';
 const bucket=await hmac(env.SESSION_SECRET||'local-rate-limit',`${scope}:${ip}:${Math.floor(Date.now()/600000)}`);
 const row=await env.DB.prepare('INSERT INTO rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,Math.floor(Date.now()/1000)+1200).first();
 if(row.count>max)fail(429,'Muitas tentativas. Aguarde alguns minutos.');
}
const cookie = (value, request, age = 28800) => `gc_session=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
async function admin(request, env) {
 if (!env.SESSION_SECRET || !env.ADMIN_PASSWORD) fail(503, 'Administração ainda não configurada.');
 const [expiry, nonce, signature] = (request.headers.get('Cookie')?.match(/(?:^|;\s*)gc_session=([^;]+)/)?.[1] || '').split('.');
 if (!expiry || !nonce || Number(expiry) < Date.now() || !equal(signature, await hmac(env.SESSION_SECRET, `${expiry}.${nonce}`))) fail(401, 'Entre novamente para continuar.');
}
async function mp(env, path, options = {}) {
 const r = await fetch(`https://api.mercadopago.com${path}`, { ...options, headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(15000) });
 if (!r.ok) { console.error('Mercado Pago HTTP', r.status); fail(502, 'Serviço de pagamento indisponível. Tente novamente.'); }
 return r.json();
}
async function events(env) {
 assertDB(env); const { results: rows } = await env.DB.prepare('SELECT * FROM events WHERE published=1 ORDER BY starts_at').all();
 for (const e of rows) {
  const { results: lots } = await env.DB.prepare("SELECT l.*,l.capacity-COALESCE(SUM(CASE WHEN o.status IN ('paid','pending') THEN o.quantity ELSE 0 END),0) AS remaining FROM lots l LEFT JOIN orders o ON o.lot_id=l.id WHERE l.event_id=? GROUP BY l.id ORDER BY position").bind(e.id).all();
  const current = lots.find(l => l.enabled && l.remaining > 0); e.lots = lots.map(l => ({ ...l, active: l.id === current?.id }));
 }
 return json({ events: rows, sales_enabled: env.SALES_ENABLED === 'true' && Boolean(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET) });
}
async function checkout(request, env) {
 checkOrigin(request); assertDB(env);
 if (env.SALES_ENABLED !== 'true' || !env.MP_ACCESS_TOKEN || !env.MP_WEBHOOK_SECRET || !env.SESSION_SECRET) fail(503, 'As vendas ainda não estão abertas.');
 await rateLimit(request,env,'checkout',10);
 const d = validateBuyer(await body(request));
 const lot = await env.DB.prepare('SELECT l.*,e.title,e.demo,e.published FROM lots l JOIN events e ON e.id=l.event_id WHERE l.id=?').bind(d.lotId).first();
 if (!lot || !lot.enabled || !lot.published) fail(400, 'Este lote não está disponível.'); if (lot.demo) fail(403, 'Eventos demonstrativos não aceitam pagamentos.');
 const id = crypto.randomUUID(), token = crypto.randomUUID() + crypto.randomUUID();
 // Reserva e regra de lote são verificadas atomicamente pelo trigger no banco.
 try { await env.DB.prepare('INSERT INTO orders(id,access_token,lot_id,quantity,amount_cents,buyer_name,buyer_email) VALUES (?,?,?,?,?,?,?)').bind(id, token, lot.id, d.quantity, lot.price_cents * d.quantity, d.name, d.email).run(); }
 catch (err) { if (/SOLD_OUT|LOT_UNAVAILABLE|EARLIER_LOT|PRICE_CHANGED/.test(err.message)) fail(409, 'A disponibilidade mudou. Atualize a página e escolha o lote disponível.'); throw err; }
 const origin = env.APP_URL || new URL(request.url).origin, orderUrl = `${origin}/pedido.html#${id}/${token}`;
 try {
  const p = await mp(env, '/checkout/preferences', { method: 'POST', headers: { 'X-Idempotency-Key': id }, body: JSON.stringify({
   items: [{ id: lot.id, title: `${lot.title} · Lote ${lot.name}`, quantity: d.quantity, currency_id: 'BRL', unit_price: lot.price_cents / 100 }],
   payer: { name: d.name, email: d.email }, external_reference: id, notification_url: `${origin}/api/webhooks/mercadopago`,
   back_urls: { success: orderUrl, pending: orderUrl, failure: orderUrl }, ...(origin.startsWith('https:')?{auto_return:'approved'}:{}),
   expires: true, expiration_date_from: new Date().toISOString(), expiration_date_to: new Date(Date.now() + 30 * 60000).toISOString(),
   payment_methods: { excluded_payment_types: [{ id: 'ticket' }] }, statement_descriptor: 'GREEN CULTURE'
  }) });
  await env.DB.prepare('UPDATE orders SET preference_id=? WHERE id=?').bind(p.id, id).run();
  const checkoutUrl = env.MP_ENV === 'production' ? p.init_point : p.sandbox_init_point;
  if (!checkoutUrl) fail(502, 'Não foi possível abrir o pagamento.');
  return json({ order_id: id, order_url: orderUrl, checkout_url: checkoutUrl }, 201);
 } catch (err) {
  // Falha de rede pode ocorrer depois de criar a preferência; nunca liberar estoque às cegas.
  console.error('Preference requires reconciliation', id); throw err;
 }
}
export function validatePayment(order, p, env) {
 return p.external_reference === order.id && p.currency_id === 'BRL' && Math.round(Number(p.transaction_amount) * 100) === order.amount_cents && Boolean(p.live_mode) === (env.MP_ENV === 'production');
}
async function applyPayment(env, p) {
 const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(p.external_reference || '').first();
 if (!order || !validatePayment(order, p, env)) fail(400, 'Pagamento não corresponde ao pedido.');
 if (order.payment_id && order.payment_id !== String(p.id)) fail(409, 'Pedido já vinculado a outro pagamento.');
 if (p.status === 'approved') {
  const statements = [env.DB.prepare("UPDATE orders SET status='paid',payment_id=? WHERE id=? AND status IN ('pending','paid')").bind(String(p.id), order.id)];
  for (let i = 1; i <= order.quantity; i++) statements.push(env.DB.prepare("INSERT OR IGNORE INTO tickets(code,order_id,ordinal) SELECT ?,id,? FROM orders WHERE id=? AND status='paid'").bind(crypto.randomUUID(), i, order.id));
  await env.DB.batch(statements);
 } else if (['refunded', 'charged_back'].includes(p.status)) await env.DB.prepare('UPDATE orders SET status=?,payment_id=? WHERE id=?').bind(p.status, String(p.id), order.id).run();
 // Tentativa rejeitada não encerra uma preferência. Reservas exigem conciliação antes de liberar.
}
async function webhook(request, env) {
 assertDB(env); if (!await verifyWebhook(request, env.MP_WEBHOOK_SECRET)) fail(401, 'Assinatura inválida.');
 const d = await body(request); if (d.type !== 'payment') return json({ received: true });
 const id = new URL(request.url).searchParams.get('data.id');
 if (String(d.data?.id) !== id || !/^\d+$/.test(id || '')) fail(400, 'Identificador inválido.');
 await applyPayment(env, await mp(env, `/v1/payments/${encodeURIComponent(id)}`)); return json({ received: true });
}
async function orderPage(request, env, url) {
 assertDB(env); const match = url.pathname.match(/^\/api\/orders\/([\w-]+)(?:\/qr\/([\w-]+))?$/); if (!match) fail(404, 'Pedido não encontrado.');
 const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
 const o = await env.DB.prepare('SELECT o.*,l.name AS lot_name,e.title,e.starts_at,e.city,e.venue FROM orders o JOIN lots l ON l.id=o.lot_id JOIN events e ON e.id=l.event_id WHERE o.id=? AND o.access_token=?').bind(match[1], token).first();
 if (!o) fail(404, 'Pedido não encontrado.');
 const { results: tickets } = await env.DB.prepare('SELECT code,ordinal,checked_in_at FROM tickets WHERE order_id=? ORDER BY ordinal').bind(o.id).all();
 if (match[2]) {
  if (o.status !== 'paid' || !tickets.some(t => t.code === match[2])) fail(404, 'Ingresso indisponível.');
  const content=`${env.APP_URL}/admin.html#${match[2]}`;
  let svg;
  if(env.LOCAL_QR)svg=await env.LOCAL_QR(content);
  else{const {default:qrcode}=await import('qrcode-generator');const qr=qrcode(0,'M');qr.addData(content);qr.make();svg=qr.createSvgTag({cellSize:5,margin:4,scalable:true});}
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } });
 }
 return json({ id: o.id, status: o.status, title: o.title, starts_at: o.starts_at, city: o.city, venue: o.venue, lot_name: o.lot_name, quantity: o.quantity, amount_cents: o.amount_cents, buyer_name: o.buyer_name, tickets: o.status === 'paid' ? tickets : [] });
}
async function adminAPI(request, env, url) {
 if (request.method === 'POST') checkOrigin(request);
 if (url.pathname === '/api/admin/login' && request.method === 'POST') {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) fail(503, 'Administração ainda não configurada.');
  assertDB(env); await rateLimit(request,env,'login',8); const d = await body(request);
  if (typeof d.password !== 'string' || !equal(await hmac(env.SESSION_SECRET, d.password), await hmac(env.SESSION_SECRET, env.ADMIN_PASSWORD))) fail(401, 'Senha incorreta.');
  const value = `${Date.now() + 28800000}.${crypto.randomUUID()}`;
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': cookie(`${value}.${await hmac(env.SESSION_SECRET, value)}`, request) } });
 }
 await admin(request, env); assertDB(env);
 if (url.pathname === '/api/admin/logout' && request.method==='POST') return new Response('{}', { headers: { 'Set-Cookie': cookie('', request, 0), 'Content-Type': 'application/json','Cache-Control':'no-store' } });
 if (url.pathname === '/api/admin/overview' && request.method === 'GET') {
  const { results: orders } = await env.DB.prepare('SELECT o.id,o.buyer_name,o.buyer_email,o.quantity,o.amount_cents,o.status,o.created_at,l.name AS lot_name FROM orders o JOIN lots l ON l.id=o.lot_id ORDER BY o.created_at DESC LIMIT 100').all();
  const { results: lots } = await env.DB.prepare('SELECT * FROM lots ORDER BY position').all();
  const event = await env.DB.prepare('SELECT * FROM events ORDER BY starts_at LIMIT 1').first(); return json({ orders, lots, event });
 }
 if (url.pathname === '/api/admin/lot' && request.method === 'POST') {
  const d = await body(request); if (!Number.isInteger(d.price_cents) || d.price_cents < 100 || d.price_cents > 10000000 || !Number.isInteger(d.capacity) || d.capacity < 0 || d.capacity > 100000) fail(400, 'Preço ou capacidade inválidos.');
  const r = await env.DB.prepare("UPDATE lots SET price_cents=?,capacity=?,enabled=? WHERE id=? AND ?>=COALESCE((SELECT SUM(quantity) FROM orders WHERE lot_id=? AND status IN ('paid','pending')),0)").bind(d.price_cents, d.capacity, d.enabled ? 1 : 0, d.id, d.capacity, d.id).run();
  if (!r.meta.changes) fail(409, 'A capacidade deve cobrir ingressos pagos e reservados.'); return json({ ok: true });
 }
 if (url.pathname === '/api/admin/event' && request.method === 'POST') {
  const d = await body(request); for (const f of ['title', 'subtitle', 'starts_at', 'city', 'venue', 'description']) if (typeof d[f] !== 'string' || !d[f].trim() || d[f].length > 2500) fail(400, 'Preencha as informações do evento.');
  if (!Number.isFinite(Date.parse(d.starts_at))) fail(400, 'Data inválida.');
  if (d.instagram_url && !/^https:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+\/?$/.test(d.instagram_url)) fail(400, 'Use o link de um post ou reel público do Instagram.');
  await env.DB.prepare('UPDATE events SET title=?,subtitle=?,starts_at=?,city=?,venue=?,description=?,instagram_url=? WHERE id=?').bind(d.title, d.subtitle, d.starts_at, d.city, d.venue, d.description, d.instagram_url || null, d.id).run(); return json({ ok: true });
 }
 if (url.pathname === '/api/admin/checkin' && request.method === 'POST') {
  const d = await body(request); if (typeof d.code !== 'string') fail(400, 'Código inválido.');
  const t = await env.DB.prepare('SELECT t.*,o.buyer_name,o.status,e.title FROM tickets t JOIN orders o ON o.id=t.order_id JOIN lots l ON l.id=o.lot_id JOIN events e ON e.id=l.event_id WHERE t.code=?').bind(d.code).first();
  if (!t) fail(404, 'Ingresso não encontrado.'); if (t.status !== 'paid') fail(409, 'Pagamento não está aprovado.');
  const r = await env.DB.prepare("UPDATE tickets SET checked_in_at=CURRENT_TIMESTAMP WHERE code=? AND checked_in_at IS NULL AND EXISTS(SELECT 1 FROM orders WHERE orders.id=tickets.order_id AND status='paid')").bind(d.code).run();
  if (!r.meta.changes) fail(409, 'Ingresso já utilizado ou pagamento indisponível.'); return json({ ok: true, name: t.buyer_name, event: t.title, ordinal: t.ordinal });
 }
 fail(404, 'Recurso não encontrado.');
}
export default { async fetch(request, env) {
 try {
  const u = new URL(request.url);
  if (!u.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (u.pathname === '/api/events' && request.method === 'GET') return await events(env);
  if (u.pathname === '/api/checkout' && request.method === 'POST') return await checkout(request, env);
  if (u.pathname === '/api/webhooks/mercadopago' && request.method === 'POST') return await webhook(request, env);
  if (u.pathname.startsWith('/api/orders/') && request.method === 'GET') return await orderPage(request, env, u);
  if (u.pathname.startsWith('/api/admin/')) return await adminAPI(request, env, u);
  fail(404, 'Recurso não encontrado.');
 } catch (err) { if (!(err instanceof HttpError)) console.error('Request failed', new URL(request.url).pathname, err.message); return json({ error: err instanceof HttpError ? err.message : 'Não foi possível concluir. Tente novamente em instantes.' }, err.status || 500); }
} };
