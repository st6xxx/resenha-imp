# 🎉 RESENHA IMP — Site da festa

Site com pagamento via Mercado Pago, geração de ingressos com QR code,
painel de admin pra validar entrada, e envio automático de email com os links.

## 📁 Arquivos do projeto

Esses arquivos **TODOS** precisam estar na **raiz** do seu repositório GitHub
(no mesmo nível, sem subpastas):

### Páginas
- `index.html` — página principal de compra
- `ingresso.html` — página com lista de ingressos de um grupo
- `ticket.html` — página individual de cada QR code
- `admin.html` — painel de admin pra validar QR

### Estilos e scripts
- `styles.css` · `script.js` — da página principal
- `ingresso.css` · `ingresso.js` — da lista de ingressos
- `ticket.css` · `ticket.js` — do ingresso individual
- `admin.css` · `admin.js` — do painel admin

### Configuração e backend
- `vercel.json` — regras de URL bonita (`/ingresso/abc` em vez de `?id=abc`)
- `api/` (pasta inteira) — funções serverless da Vercel:
  - `api/create-payment.js`
  - `api/webhook.js`
  - `api/get-tickets.js`
  - `api/get-ticket.js`
  - `api/validate-ticket.js`
  - `api/admin-stats.js`

### Extras
- `google-apps-script.gs` — código pra colar no Apps Script da planilha
- `DEPLOY.md` — guia completo de deploy
- `README.md` — este arquivo

## 🚀 Pra subir o site

Consulta `DEPLOY.md` pro guia passo a passo, mas o resumo é:

1. **Google Sheets** + cola `google-apps-script.gs` → pega URL
2. **Mercado Pago** → cria app e pega Access Token
3. **Resend** → cria API key
4. **GitHub** → sobe TODOS os arquivos acima na raiz do repo
5. **Vercel** → import do GitHub + adiciona env vars:
   - `MP_ACCESS_TOKEN`
   - `SHEETS_URL`
   - `RESEND_API_KEY`
   - `ADMIN_PASSWORD`
6. Deploy → testa o fluxo completo

## ⚠️ Estrutura no GitHub

A estrutura DEVE ser exatamente essa no GitHub (raiz do repo):

```
seu-repo/
├── README.md
├── DEPLOY.md
├── index.html
├── ingresso.html
├── ticket.html
├── admin.html
├── styles.css
├── ingresso.css
├── ticket.css
├── admin.css
├── script.js
├── ingresso.js
├── ticket.js
├── admin.js
├── vercel.json
├── google-apps-script.gs
└── api/
    ├── create-payment.js
    ├── webhook.js
    ├── get-tickets.js
    ├── get-ticket.js
    ├── validate-ticket.js
    └── admin-stats.js
```

**NÃO coloca tudo dentro de uma pasta `resenha-imp/`** — os arquivos têm
que estar na raiz do repositório do GitHub.

## 🔧 Stack

- Frontend: HTML/CSS/JS vanilla (zero frameworks)
- Backend: Funções serverless da Vercel (Node.js)
- Banco de dados: Google Sheets via Apps Script
- Pagamento: Mercado Pago Checkout Pro
- Email: Resend
- QR code: api.qrserver.com (free, sem API key)
- Scanner: html5-qrcode (CDN)
