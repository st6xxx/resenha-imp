# RESENHA IMP — Como subir o site com pagamento automático

A integração com Mercado Pago precisa de uma função serverless rodando — isso significa
hospedar na **Vercel** ou **Netlify**. As duas têm plano grátis que sobra pra essa festa.

Vou guiar com Vercel (mais simples) abaixo. Se preferir Netlify, é parecido.

---

## 1. Pegue o token do Mercado Pago

1. Acesse https://www.mercadopago.com.br/developers/panel/app (logado na sua conta MP)
2. Clica em **"Suas integrações"** → **"Criar aplicativo"**
3. Preenche:
   - Nome: `Resenha IMP`
   - Modelo de integração: **"CheckoutPro"**
   - Solução de pagamento: **"Pagamentos online"**
4. Depois de criar, vai pra aba **"Credenciais de produção"**
5. Copia o **Access Token** (começa com `APP_USR-`)

> Pra testar antes, use as **credenciais de teste** (Access Token começando com `TEST-`).
> Aí dá pra pagar com cartões de teste sem cobrar nada.

---

## 2. Suba o código pro GitHub

1. Cria um repositório novo no GitHub
2. Sobe a pasta `resenha-imp/` inteira (pode usar GitHub Desktop, ou comandos git)

```bash
cd resenha-imp
git init
git add .
git commit -m "festa"
git remote add origin https://github.com/SEU_USUARIO/resenha-imp.git
git push -u origin main
```

---

## 3. Deploya na Vercel

1. Vai em https://vercel.com → cria conta (pode logar com GitHub)
2. Clica em **"Add New..." → "Project"**
3. Importa o repositório `resenha-imp` que você acabou de criar
4. Na tela de configuração:
   - **Framework Preset:** Other
   - **Root Directory:** `./` (raiz mesmo, já que você subiu só a pasta `resenha-imp`)
5. **NÃO clica em Deploy ainda** — primeiro adiciona a variável de ambiente:
6. Expande **"Environment Variables"** e adiciona:
   - **Name:** `MP_ACCESS_TOKEN`
   - **Value:** o token que você copiou do MP (ex: `APP_USR-1234-...`)
   - Marca todas as opções (Production, Preview, Development)
7. **Agora sim** clica em **"Deploy"**

A Vercel vai dar uma URL tipo `https://resenha-imp.vercel.app`. **Pronto!**

---

## 4. (Opcional) Domínio próprio

Na Vercel: **Settings → Domains → Add**. Compra um domínio no Registro.br (uns R$ 40/ano)
e aponta os DNS pra Vercel. Não precisa mexer no código.

---

## Como saber se tá funcionando

1. Abre `https://seu-site.vercel.app` no navegador
2. Escolhe 3 pessoas, digita nomes
3. Clica em **"pagar R$ 165 no mercado pago"**
4. Você deve ser redirecionado pro Mercado Pago **com o valor R$ 165 já preenchido**
5. Em testes, use os [cartões de teste do MP](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/cards)

Se der erro, abre o console do navegador (F12) e procura mensagens começando com `[mp]`.

### Logs no servidor

Se a função estiver dando pau, dá pra ver os logs em:
**Vercel Dashboard → seu projeto → Logs**

---

## Resumo dos arquivos

| Arquivo | O que faz |
|---|---|
| `index.html` | Estrutura |
| `styles.css` | Visual + animações |
| `script.js` | Lógica do front, IA, calculadora |
| `api/create-payment.js` | Função serverless que cria o checkout MP |
| `google-apps-script.gs` | Script pra Google Sheets (banco de dados) |

## Variáveis de ambiente necessárias na Vercel

| Nome | O que é | Obrigatório? |
|---|---|---|
| `MP_ACCESS_TOKEN` | Token do Mercado Pago | ✅ |
| `SHEETS_URL` | URL do Google Apps Script publicado | ✅ |
| `ADMIN_PASSWORD` | Senha do painel `/admin` (escolha uma forte) | ✅ |
| `RESEND_API_KEY` | API key do [Resend](https://resend.com) pra enviar email com os ingressos | recomendado |
| `RESEND_FROM` | Email "from" customizado (ex: `Resenha IMP <festa@seudominio.com>`). Se vazio, usa o sandbox do Resend | opcional |
| `SITE_URL` | URL pública do site (ex: `https://resenha.vercel.app`). Se vazio, detecta automaticamente do header | opcional |

Em `script.js` você também tem 3 constantes pra editar diretamente no código (não são env vars):

- `MP_LINK` — link de fallback caso a API falhe (pode deixar como tá)
- `WHATSAPP` — seu número de WhatsApp pra confirmações
- `SHEET_URL` — URL do Google Apps Script (planilha)
