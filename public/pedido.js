const $=s=>document.querySelector(s);
const [id,token]=location.hash.slice(1).split('/');
const labels={pending:'Aguardando confirmação do pagamento',paid:'Pagamento aprovado · nos vemos na pista!',cancelled:'Pedido cancelado',refunded:'Pagamento reembolsado',charged_back:'Pagamento contestado'};
let polling,blobUrls=[];
function add(parent,tag,text){const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;}
async function load(){
 if(!id||!token){$('#order-status').textContent='Abra o link privado completo do seu pedido.';$('#refresh-order').disabled=true;return;}
 $('#refresh-order').disabled=true;
 try{
  const r=await fetch(`/api/orders/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok)throw new Error(d.error);
  $('#order-status').textContent=labels[d.status]||d.status;
  const info=$('#order-info');info.hidden=false;info.replaceChildren();add(info,'h2',d.title);add(info,'p',`${d.buyer_name} · ${d.quantity} ingresso(s) · Lote ${d.lot_name}`);add(info,'p',`${new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(d.starts_at))} · ${d.city}`);add(info,'p',d.venue);add(info,'strong',new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(d.amount_cents/100));
  const list=$('#order-tickets');list.replaceChildren();blobUrls.forEach(u=>URL.revokeObjectURL(u));blobUrls=[];
  for(const ticket of d.tickets){
   const card=document.createElement('article');card.className='panel ticket';
   const qr=await fetch(`/api/orders/${encodeURIComponent(id)}/qr/${encodeURIComponent(ticket.code)}`,{headers:{Authorization:`Bearer ${token}`}});
   if(qr.ok){const image=document.createElement('img');const url=URL.createObjectURL(await qr.blob());blobUrls.push(url);image.src=url;image.alt=`QR Code do ingresso ${ticket.ordinal}`;card.append(image);}
   const text=document.createElement('div');add(text,'h3',`Ingresso ${ticket.ordinal} de ${d.quantity}`);add(text,'p',ticket.checked_in_at?'Entrada já registrada':'Apresente este QR Code na entrada');add(text,'code',ticket.code);card.append(text);list.append(card);
  }
  clearTimeout(polling);if(d.status==='pending'&&!document.hidden)polling=setTimeout(load,15000);
 }catch(e){$('#order-status').textContent=e.message||'Não foi possível consultar o pedido.';}finally{$('#refresh-order').disabled=false;}
}
$('#refresh-order').onclick=load;$('#print-order').onclick=()=>window.print();load();
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(polling);else load();});
