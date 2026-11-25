# Green Culture � Ingressos

Primeira vers�o da plataforma independente de venda de ingressos do Coletivo Green Culture.

## Estado desta entrega

- P�gina responsiva com evento demonstrativo, lotes, quantidade, modal de compra e galeria em carrossel.
- Link oficial para `@greenculture.prod`. Um post/reel p�blico pode ser cadastrado no painel e aberto em modal incorporado; n�o h� importa��o autom�tica do feed.
- Painel com senha: editar informa��es do evento, pre�os e capacidades dos lotes, listar os �ltimos 100 pedidos e confirmar entradas.
- Backend Cloudflare Worker + D1 com Checkout Pro do Mercado Pago, webhook assinado, verifica��o de valor/moeda/ambiente, ingressos individuais e QR Code.
- Estoque reservado atomicamente; emiss�o idempotente; check-in �nico e bloqueio de ingressos reembolsados/contestados.
- Pr�via local com SQLite, sem depender da instala��o do Wrangler. Vendas desligadas e evento marcado como demonstra��o.

**N�o foi publicado nem enviado ao GitHub nesta sess�o:** o executor n�o conseguiu se conectar ao npm/GitHub. Integra��o real do Mercado Pago e execu��o no runtime Cloudflare ainda precisam ser homologadas. Testes locais usam respostas simuladas do provedor.

## Abrir a pr�via

Requisito: Node.js 22.13 ou superior. Nesta m�quina o Node 22.22.2 j� est� dispon�vel.

```powershell
cd 'E:\Lotus Code\Projetos gpt\green-culture-ingressos'
npm run dev
```

P�gina: http://127.0.0.1:8787/

Painel: http://127.0.0.1:8787/admin.html

A senha � gerada no primeiro in�cio em `.local/settings.json`, na chave `ADMIN_PASSWORD`. Esse arquivo e o banco `.local/data.sqlite` s�o privados e ignorados pelo Git. O QR no adaptador local usa Python com `qrcode` (j� dispon�vel na m�quina). Em Cloudflare a biblioteca `qrcode-generator` � empacotada pelo Wrangler.

O servidor de pr�via escuta apenas em `127.0.0.1`; ele n�o � hospedagem de produ��o. A pr�via n�o altera nem conecta ao Odoo ou ao site principal.

## Testar

```powershell
npm run check
npm test
python test/inventory.py
```

Os testes cobrem: webhook adulterado, dados inv�lidos, pre�o enviado pelo navegador, isolamento de pedidos privados, estoque e ordem dos lotes, emiss�o idempotente, check-in repetido, reembolso e bloqueio de venda de evento demonstrativo.

## GitHub

Este diret�rio � um projeto separado. Criar um reposit�rio pr�prio, por exemplo `green-culture-ingressos`, na conta desejada; depois conectar o remote e enviar a branch `main`. N�o reutilizar o reposit�rio nem o pipeline do site principal. N�o versionar `.dev.vars`, `.env`, `.local`, tokens nem bases reais.

## Publicar na Cloudflare, preservando o site principal

1. Instalar as depend�ncias: `npm install`.
2. Autenticar: `npx wrangler login`.
3. Criar banco pr�prio: `npx wrangler d1 create green-culture-ingressos`.
4. Copiar o `database_id` retornado para `wrangler.jsonc`. O ID zerado atual � apenas placeholder.
5. Aplicar migra��es: `npm run db:remote`.
6. Definir `APP_URL` para a URL da nova aplica��o; manter `SALES_ENABLED=false`.
7. Salvar segredos pelo terminal, sem inclu�-los no c�digo:

```powershell
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put MP_ACCESS_TOKEN
npx wrangler secret put MP_WEBHOOK_SECRET
```

8. Publicar o novo Worker: `npm run deploy`. Primeiro conferir a URL `workers.dev` retornada pela Cloudflare.
9. Ap�s validar, vincular **somente** `ingressos.ancestralculturemusic.live` ao novo Worker por Custom Domain. N�o alterar registros do dom�nio raiz, `www`, rotas do site principal ou t�nneis existentes. N�o usar wildcard `*.ancestralculturemusic.live/*`.
10. Atualizar `APP_URL` para `https://ingressos.ancestralculturemusic.live` e publicar novamente.

O arquivo de configura��o deliberadamente n�o cont�m rotas para o dom�nio principal. O painel Cloudflare permite conectar um reposit�rio GitHub � aplica��o nova; isso requer acesso � conta do titular.

## Mercado Pago: homologa��o e abertura

Usar uma aplica��o da produ��o do coletivo, com credenciais de teste primeiro. Definir `MP_ENV=test` para sandbox e `production` para pagamentos reais. Configurar t�pico `payment` e a URL HTTPS `APP_URL/api/webhooks/mercadopago`; salvar a assinatura secreta do painel em `MP_WEBHOOK_SECRET`.

O comprador recebe o link privado na tela antes de ir ao Mercado Pago. Ao retornar, a p�gina consulta o estado salvo no servidor e aguarda webhook. N�o se usa `status` da URL para aprovar pagamentos. N�o h� envio de e-mail nesta entrega: o comprador precisa guardar o link privado. Antes da abertura p�blica, integrar entrega/recupera��o do ingresso por e-mail para evitar perda de acesso.

O evento permanece `demo=1`, e a API recusa pagamento mesmo que `SALES_ENABLED=true`. Ap�s cadastrar dados reais, concluir testes com comprador/vendedor de teste, confirmar webhook, QR e entrada, e publicar as condi��es de venda, a ativa��o � deliberada: definir `demo=0` no evento via migra��o administrativa revisada e `SALES_ENABLED=true`. N�o habilitar venda real usando dados demonstrativos.

### Reservas e pend�ncias para opera��o real

As prefer�ncias expiram em 30 minutos, mas uma tentativa rejeitada n�o encerra a prefer�ncia, e uma notifica��o atrasada pode aprovar um pagamento. Por isso **reservas pendentes n�o s�o liberadas automaticamente por tempo**. Isso evita sobrevenda, mas pode reter lotes em compras abandonadas. Antes de operar vendas reais, implementar concilia��o das prefer�ncias/pagamentos e libera��o segura das reservas, al�m de testes reais de Pix expirado, tentativa rejeitada, reembolso e webhook atrasado. N�o alterar pedidos pendentes manualmente sem verificar o provedor.

Outros limites desta vers�o: uma p�gina apresenta o primeiro evento publicado; a arte e as tr�s fotos s�o refer�ncias fixas, sem upload; a tela administrativa edita o evento existente e seus lotes, sem criar novos eventos; n�o h� checkout de m�ltiplos organizadores, envio de e-mail, transfer�ncia de titularidade ou scanner embutido. Para check-in, a c�mera normal do celular abre o link do QR; o operador autentica e confirma a entrada. O check-in exige conex�o.

Completar cadastro do organizador, canal de suporte, termos/cancelamento e pol�tica de reten��o antes da abertura. Adicionar prote��o de tr�fego (por exemplo, Turnstile) � compra p�blica e pol�tica de acesso de equipe. O login j� tem sess�o HttpOnly, verifica��o de origem e limite de tentativas por IP. Limpar periodicamente registros expirados da tabela `rate_limits`.

## Fontes t�cnicas

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/d1/
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/overview
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications
- https://developers.facebook.com/docs/graph-api/reference/instagram-oembed/

As imagens da pr�via s�o refer�ncias do Unsplash e a tipografia � carregada por Google Fonts. Nenhuma imagem foi apresentada como fotografia real de um evento do coletivo.
