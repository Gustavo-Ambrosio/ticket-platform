const $ = (s) => document.querySelector(s);
const money = (c) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
let event, lots=[], selected, quantity=1, sales=false;
const photos=[
 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=85',
 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1600&q=85',
 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1600&q=85'
];
function renderLots(){
 const container=$('#lots');container.replaceChildren();
 for(const lot of lots){
  const b=document.createElement('button');b.type='button';b.className='lot'+(selected?.id===lot.id?' selected':'');
  const available=lot.active&&lot.remaining>0;
  b.disabled=!available;b.setAttribute('aria-pressed',String(selected?.id===lot.id));
  for(const [tag,text] of [['span',lot.name],['strong',money(lot.price_cents)],['small',lot.remaining<=0?'Esgotado':available?'Lote dispon�vel':'Em breve']]){const el=document.createElement(tag);el.textContent=text;b.append(el);}
  b.onclick=()=>{selected=lot;quantity=Math.min(quantity,lot.remaining);renderLots();update();};container.append(b);
 }update();
}
function update(){
 $('#quantity').textContent=quantity;$('#total').textContent=money((selected?.price_cents||0)*quantity);
 $('#less').disabled=quantity<=1;$('#more').disabled=!selected||quantity>=Math.min(6,selected.remaining);
 $('#buy').disabled=!selected;
}
$('#less').onclick=()=>{if(quantity>1)quantity--;update();};$('#more').onclick=()=>{if(selected&&quantity<Math.min(6,selected.remaining))quantity++;update();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#buy').onclick=()=>{
 $('#checkout-summary').textContent=`${quantity} ingresso${quantity>1?'s':''} � Lote ${selected.name} � ${money(selected.price_cents*quantity)}`;
 $('#demo-message').hidden=sales;$('#checkout-form').hidden=!sales;$('#order-created').hidden=true;
 $('#checkout').showModal();
};
$('#checkout-form').onsubmit=async e=>{
 e.preventDefault();const b=$('#checkout-submit');b.disabled=true;$('#checkout-error').textContent='';
 try{
  const form=new FormData(e.target);const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lotId:selected.id,quantity,name:form.get('name'),email:form.get('email')})});
  const data=await r.json();if(!r.ok)throw new Error(data.error||'N�o foi poss�vel iniciar a compra.');
  $('#checkout-form').hidden=true;$('#order-created').hidden=false;
  $('#order-link').href=data.order_url;$('#order-link').textContent=data.order_url;
  $('#payment-link').href=data.checkout_url;
 }catch(err){$('#checkout-error').textContent=err.message;}finally{b.disabled=false;}
};
document.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>{$('#large-photo').src=photos[Number(b.dataset.photo)];$('#photo-dialog').showModal();});
$('#previous-photo').onclick=()=>$('#gallery').scrollBy({left:-$('#gallery').clientWidth*.85,behavior:'smooth'});
$('#next-photo').onclick=()=>$('#gallery').scrollBy({left:$('#gallery').clientWidth*.85,behavior:'smooth'});
async function init(){
 try{
  const r=await fetch('/api/events');if(!r.ok)throw new Error('Eventos indispon�veis. Tente novamente em instantes.');
  const data=await r.json();event=data.events[0];if(!event)throw new Error('Novos encontros em breve.');
  sales=data.sales_enabled&&!event.demo;lots=event.lots;selected=lots.find(l=>l.active&&l.remaining>0);
  for(const [id,key] of [['event-title','title'],['event-subtitle','subtitle'],['event-description','description'],['event-city','city'],['event-venue','venue']])$('#'+id).textContent=event[key];
  $('#event-date').textContent=new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(event.starts_at));
  if(sales)$('#payment-note').textContent='Pagamento no Mercado Pago � ingresso ap�s confirma��o';
  if(!event.demo)document.querySelector('.demo-pill').textContent='PR�XIMO ENCONTRO';
  const artTitle=document.querySelector('.art-title');artTitle.replaceChildren();
  const titleText=document.createElement('em');titleText.textContent=event.title;artTitle.append(titleText);
  const flower=document.createElement('span');flower.textContent='?';artTitle.append(flower);
  const date=new Date(event.starts_at);
  const shortDate=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:'America/Sao_Paulo'}).format(date).toUpperCase();
  document.querySelector('.event-meta span:first-child').textContent=shortDate+' '+date.getFullYear();
  const artDate=document.querySelector('.art-footer span:first-child');artDate.replaceChildren();
  artDate.append(document.createTextNode(shortDate),document.createElement('br'));
  const year=document.createElement('b');year.textContent=date.getFullYear();artDate.append(year);
  if(selected)$('#mobile-price').textContent=`A partir de ${money(selected.price_cents)}`;
  if(event.instagram_url){
   const b=document.createElement('button');b.className='post-card';b.textContent='? Ver publica��o do evento';
   b.onclick=()=>{const u=new URL(event.instagram_url);$('#post-frame').src=u.origin+u.pathname.replace(/\/$/,'')+'/embed/';$('#post-link').href=event.instagram_url;$('#post-dialog').showModal();};$('#instagram-posts').append(b);
  }
  renderLots();
 }catch(err){$('#lots').textContent=err.message;$('#buy').disabled=true;$('#payment-note').textContent='N�o foi poss�vel consultar a disponibilidade.';}
}
init();
