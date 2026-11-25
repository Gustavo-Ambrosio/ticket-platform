# Green Culture · Ingressos

Primeira versão da plataforma independente de venda de ingressos do Coletivo Green Culture.

## Estado desta entrega

- Página responsiva com evento demonstrativo, lotes, quantidade, modal de compra e galeria em carrossel.
- Link oficial para `@greenculture.prod`. Um post/reel público pode ser cadastrado no painel e aberto em modal incorporado; não há importação automática do feed.
- Painel com senha: editar informações do evento, preços e capacidades dos lotes, listar os últimos 100 pedidos e confirmar entradas.
- Backend Cloudflare Worker + D1 com Checkout Pro do Mercado Pago, webhook assinado, verificação de valor/moeda/ambiente, ingressos individuais e QR Code.
- Estoque reservado atomicamente; emissão idempotente; check-in único e bloqueio de ingressos reembolsados/contestados.
- Prévia local com SQLite, sem depender da instalação do Wrangler. Vendas desligadas e evento marcado como demonstração.

**Não foi publicado nem enviado ao GitHub nesta sessão:** o executor não conseguiu se conectar ao npm/GitHub. Integração real do Mercado Pago e execução no runtime Cloudflare ainda precisam ser homologadas. Testes locais usam respostas simuladas do provedor.

## Abrir a prévia

Requisito: Node.js 22.13 ou superior. Nesta máquina o Node 22.22.2 já está disponível.

```powershell
cd 'E:\Lotus Code\Projetos gpt\green-culture-ingressos'
npm run dev
```

Página: http://127.0.0.1:8787/

Painel: http://127.0.0.1:8787/admin.html

A senha é gerada no primeiro início em `.local/settings.json`, na chave `ADMIN_PASSWORD`. Esse arquivo e o banco `.local/data.sqlite` são privados e ignorados pelo Git. O QR no adaptador local usa Python com `qrcode` (já disponível na máquina). Em Cloudflare a biblioteca `qrcode-generator` é empacotada pelo Wrangler.

O servidor de prévia escuta apenas em `127.0.0.1`; ele não é hospedagem de produção. A prévia não altera nem conecta ao Odoo ou ao site principal.

## Testar

```powershell
npm run check
npm test
python test/inventory.py
```

Os testes cobrem: webhook adulterado, dados inválidos, preço enviado pelo navegador, isolamento de pedidos privados, estoque e ordem dos lotes, emissão idempotente, check-in repetido, reembolso e bloqueio de venda de evento demonstrativo.

## GitHub

Este diretório é um projeto separado. Criar um repositório próprio, por exemplo `green-culture-ingressos`, na conta desejada; depois conectar o remote e enviar a branch `main`. Não reutilizar o repositório nem o pipeline do site principal. Não versionar `.dev.vars`, `.env`, `.local`, tokens nem bases reais.

## Publicar na Cloudflare, preservando o site principal

1. Instalar as dependências: `npm install`.
2. Autenticar: `npx wrangler login`.
3. Criar banco próprio: `npx wrangler d1 create green-culture-ingressos`.
4. Copiar o `database_id` retornado para `wrangler.jsonc`. O ID zerado atual é apenas placeholder.
5. Aplicar migrações: `npm run db:remote`.
6. Definir `APP_URL` para a URL da nova aplicação; manter `SALES_ENABLED=false`.
7. Salvar segredos pelo terminal, sem incluí-los no código:

```powershell
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put MP_ACCESS_TOKEN
npx wrangler secret put MP_WEBHOOK_SECRET
```

8. Publicar o novo Worker: `npm run deploy`. Primeiro conferir a URL `workers.dev` retornada pela Cloudflare.
9. Após validar, vincular **somente** `ingressos.ancestralculturemusic.live` ao novo Worker por Custom Domain. Não alterar registros do domínio raiz, `www`, rotas do site principal ou túnneis existentes. Não usar wildcard `*.ancestralculturemusic.live/*`.
10. Atualizar `APP_URL` para `https://ingressos.ancestralculturemusic.live` e publicar novamente.

O arquivo de configuração deliberadamente não contém rotas para o domínio principal. O painel Cloudflare permite conectar um repositório GitHub à aplicação nova; isso requer acesso à conta do titular.

## Mercado Pago: homologação e abertura

Usar uma aplicação da produção do coletivo, com credenciais de teste primeiro. Definir `MP_ENV=test` para sandbox e `production` para pagamentos reais. Configurar tópico `payment` e a URL HTTPS `APP_URL/api/webhooks/mercadopago`; salvar a assinatura secreta do painel em `MP_WEBHOOK_SECRET`.

O comprador recebe o link privado na tela antes de ir ao Mercado Pago. Ao retornar, a página consulta o estado salvo no servidor e aguarda webhook. Não se usa `status` da URL para aprovar pagamentos. Não há envio de e-mail nesta entrega: o comprador precisa guardar o link privado. Antes da abertura pública, integrar entrega/recuperação do ingresso por e-mail para evitar perda de acesso.

O evento permanece `demo=1`, e a API recusa pagamento mesmo que `SALES_ENABLED=true`. Após cadastrar dados reais, concluir testes com comprador/vendedor de teste, confirmar webhook, QR e entrada, e publicar as condições de venda, a ativação é deliberada: definir `demo=0` no evento via migração administrativa revisada e `SALES_ENABLED=true`. Não habilitar venda real usando dados demonstrativos.

### Reservas e pendências para operação real

As preferências expiram em 30 minutos, mas uma tentativa rejeitada não encerra a preferência, e uma notificação atrasada pode aprovar um pagamento. Por isso **reservas pendentes não são liberadas automaticamente por tempo**. Isso evita sobrevenda, mas pode reter lotes em compras abandonadas. Antes de operar vendas reais, implementar conciliação das preferências/pagamentos e liberação segura das reservas, além de testes reais de Pix expirado, tentativa rejeitada, reembolso e webhook atrasado. Não alterar pedidos pendentes manualmente sem verificar o provedor.

Outros limites desta versão: uma página apresenta o primeiro evento publicado; a arte e as três fotos são referências fixas, sem upload; a tela administrativa edita o evento existente e seus lotes, sem criar novos eventos; não há checkout de múltiplos organizadores, envio de e-mail, transferência de titularidade ou scanner embutido. Para check-in, a câmera normal do celular abre o link do QR; o operador autentica e confirma a entrada. O check-in exige conexão.

Completar cadastro do organizador, canal de suporte, termos/cancelamento e política de retenção antes da abertura. Adicionar proteção de tráfego (por exemplo, Turnstile) à compra pública e política de acesso de equipe. O login já tem sessão HttpOnly, verificação de origem e limite de tentativas por IP. Limpar periodicamente registros expirados da tabela `rate_limits`.

## Fontes técnicas

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/d1/
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/overview
- https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications
- https://developers.facebook.com/docs/graph-api/reference/instagram-oembed/

As imagens da prévia são referências do Unsplash e a tipografia é carregada por Google Fonts. Nenhuma imagem foi apresentada como fotografia real de um evento do coletivo.
