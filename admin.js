/* ============================================
   ADMIN · login + scanner de QR + validação
============================================ */

const $ = (id) => document.getElementById(id);

let pwd = sessionStorage.getItem('adminPwd') || '';
let scanner = null;
let scanning = false;
const history = [];

// ===== LOGIN =====

async function tryLogin(p) {
  // Validação acontece no servidor — a senha verdadeira fica como env var.
  // Pra testar localmente: faz um ping numa validação fake.
  // O importante é que o backend rejeita a senha errada.
  const r = await fetch('/api/validate-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: p, ticketId: '__ping__' })
  });
  const data = await r.json();
  if (data.error === 'invalid_password') return false;
  return true; // qualquer outra resposta (inclusive ticket_not_found) significa senha correta
}

$('loginBtn').addEventListener('click', async () => {
  const v = $('pwd').value.trim();
  if (!v) return;
  $('loginBtn').disabled = true;
  $('loginBtn').textContent = 'verificando...';
  const ok = await tryLogin(v);
  $('loginBtn').disabled = false;
  $('loginBtn').textContent = 'entrar';
  if (!ok) {
    $('loginError').hidden = false;
    return;
  }
  pwd = v;
  sessionStorage.setItem('adminPwd', pwd);
  enterScanner();
});

$('pwd').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('loginBtn').click();
});

$('logout').addEventListener('click', () => {
  pwd = '';
  sessionStorage.removeItem('adminPwd');
  if (scanner) scanner.stop().catch(() => {});
  $('scanner').hidden = true;
  $('login').hidden = false;
  $('pwd').value = '';
});

// ===== SCANNER =====

async function enterScanner() {
  $('login').hidden = true;
  $('scanner').hidden = false;
  await loadStats();
  await startCamera();
}

async function startCamera() {
  if (scanner) {
    try { await scanner.stop(); } catch {}
  }
  scanner = new Html5Qrcode('qrReader');
  scanning = true;
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: { width: 240, height: 240 } },
      onScan,
      () => {}
    );
  } catch (err) {
    alert('não consegui acessar a câmera: ' + err.message);
  }
}

let lastScanTime = 0;
let lastScanText = '';

async function onScan(decoded) {
  // dedup rápido — html5-qrcode dispara várias vezes pro mesmo QR
  const now = Date.now();
  if (decoded === lastScanText && now - lastScanTime < 3000) return;
  lastScanText = decoded;
  lastScanTime = now;

  if (!scanning) return;
  scanning = false;
  try { await scanner.pause(true); } catch {}

  const ticketId = String(decoded).trim();
  if (!ticketId || ticketId.length > 40) {
    showResult('notfound', '🤔 QR inválido', 'isso não parece um ingresso da RESENHA IMP.');
    return;
  }

  try {
    const r = await fetch('/api/validate-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId, password: pwd })
    });
    const data = await r.json();

    if (data.ok) {
      showResult('ok', `✅ ${data.name}`,
        `<strong>${data.gender}</strong> · entrou às ${new Date(data.validatedAt).toLocaleTimeString('pt-BR')}`);
      addHistory('ok', data.name, data.gender);
      vibrate([80]);
    } else if (data.error === 'already_used') {
      const when = data.usedAt ? new Date(data.usedAt).toLocaleString('pt-BR') : '—';
      showResult('used', `⚠️ JÁ USADO`,
        `<strong>${data.name}</strong> · ${data.gender}<br>já entrou em ${when}`);
      addHistory('warn', `JÁ USADO: ${data.name}`, data.gender);
      vibrate([60, 60, 60]);
    } else if (data.error === 'ticket_not_found') {
      showResult('notfound', '❌ não encontrado',
        'esse QR não corresponde a nenhum ingresso.');
      addHistory('err', 'não encontrado', ticketId.slice(0, 8));
      vibrate([200]);
    } else if (data.error === 'invalid_password') {
      alert('sua sessão expirou. faça login de novo.');
      $('logout').click();
    } else {
      showResult('notfound', '🤷 erro', data.error || 'tenta de novo');
    }
    await loadStats();
  } catch (err) {
    showResult('notfound', '⚠️ erro de rede', 'não consegui falar com o servidor.');
  }
}

function showResult(kind, title, details) {
  const el = $('result');
  el.className = `result ${kind}`;
  $('resultTitle').innerHTML = title;
  $('resultDetails').innerHTML = details;
  const icons = { ok: '🎉', used: '⛔', notfound: '❓' };
  $('resultIcon').textContent = icons[kind] || '';
  el.hidden = false;
}

$('next').addEventListener('click', async () => {
  $('result').hidden = true;
  scanning = true;
  try { await scanner.resume(); } catch {}
});

function addHistory(kind, name, extra) {
  const li = document.createElement('li');
  if (kind === 'warn') li.className = 'warn';
  if (kind === 'err')  li.className = 'err';
  li.innerHTML = `<span>${name} · ${extra || ''}</span><span>${new Date().toLocaleTimeString('pt-BR')}</span>`;
  const ul = $('history');
  ul.insertBefore(li, ul.firstChild);
  while (ul.children.length > 12) ul.removeChild(ul.lastChild);
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ===== STATS =====

async function loadStats() {
  try {
    const r = await fetch('/api/admin-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    const data = await r.json();
    if (data.ok) {
      $('stats').innerHTML = `
        <strong>${data.used}</strong> validados ·
        <strong>${data.remaining}</strong> restantes ·
        ${data.byGender ? `${data.byGender.Mulher} ♀ · ${data.byGender.Homem} ♂` : ''}
      `;
    }
  } catch {}
}

// auto-login se já tem senha salva na sessão
if (pwd) enterScanner();
