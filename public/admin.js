const $=s=>document.querySelector(s);let currentEvent;
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
async function api(path,data){const r=await fetch('/api/admin/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const d=await r.json();if(!r.ok){const e=new Error(d.error||'Não foi possível concluir.');e.status=r.status;throw e;}return d;}
function message(text,error=false){$('#message').textContent=text;$('#message').className=error?'error':'status';}
function text(parent,tag,value){const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;}
async function overview(){
 try{
  const d=await api('overview');$('#login').hidden=true;$('#dashboard').hidden=false;$('#logout').hidden=false;currentEvent=d.event;
  for(const name of ['title','subtitle','starts_at','city','venue','description','instagram_url'])$('#event-form').elements[name].value=d.event?.[name]||'';
  const lots=$('#admin-lots');lots.replaceChildren();for(const lot of d.lots){
   const form=document.createElement('form');form.className='panel';text(form,'h3',lot.name);
   for(const [name,title,value,step] of [['price','Preço em reais',(lot.price_cents/100).toFixed(2),'0.01'],['capacity','Capacidade',lot.capacity,'1']]){const label=text(form,'label',title);const input=document.createElement('input');Object.assign(input,{name,type:'number',value,step,min:name==='price'?'1':'0',required:true});label.append(input);}
   const label=text(form,'label','Lote habilitado');const enabled=document.createElement('input');Object.assign(enabled,{type:'checkbox',name:'enabled',checked:Boolean(lot.enabled)});label.append(enabled);
   const button=text(form,'button','Salvar lote');button.className='button dark';
   form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{await api('lot',{id:lot.id,price_cents:Math.round(Number(form.elements.price.value)*100),capacity:Number(form.elements.capacity.value),enabled:enabled.checked});message('Lote atualizado.');await overview();}catch(err){message(err.message,true);}finally{button.disabled=false;}};lots.append(form);
  }
  const orders=$('#admin-orders');orders.replaceChildren();const labels={pending:'Pendente',paid:'Pago',refunded:'Reembolsado',charged_back:'Contestado',cancelled:'Cancelado'};
  for(const o of d.orders){const row=document.createElement('div');row.className='order-row';text(row,'strong',`${o.buyer_name} · ${labels[o.status]||o.status}`);text(row,'div',`${o.buyer_email} · ${o.quantity} ingresso(s) · ${o.lot_name} · ${money(o.amount_cents)}`);text(row,'small',`${o.created_at} UTC · ${o.id}`);orders.append(row);}
  $('#sales-summary').textContent=d.orders.length?`${d.orders.filter(o=>o.status==='paid').length} pedido(s) pago(s) nesta lista.`:'Nenhuma venda por enquanto.';
 }catch(e){if(e.status===401){$('#login').hidden=false;$('#dashboard').hidden=true;$('#logout').hidden=true;}else message(e.message,true);}
}
$('#login').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await api('login',{password:e.target.elements.password.value});e.target.reset();message('Bem-vindo à produção.');await overview();}catch(err){message(err.message,true);}finally{button.disabled=false;}};
$('#logout').onclick=async()=>{try{await api('logout',{});location.reload();}catch(err){message(err.message,true);}};
$('#event-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await api('event',{...Object.fromEntries(new FormData(e.target)),id:currentEvent.id});message('Informações do evento atualizadas.');}catch(err){message(err.message,true);}finally{button.disabled=false;}};
$('#ticket-code').value=location.hash.slice(1);
$('#checkin').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{let code=$('#ticket-code').value.trim();if(code.includes('#'))code=code.split('#').pop();const d=await api('checkin',{code});$('#checkin-result').textContent=`Entrada confirmada: ${d.name} · ${d.event} · ingresso ${d.ordinal}.`;$('#checkin-result').className='status';e.target.reset();history.replaceState(null,'',location.pathname);}catch(err){$('#checkin-result').textContent=err.message;$('#checkin-result').className='error';}finally{button.disabled=false;}};
overview();
