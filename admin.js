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
  // não inicia a câmera automaticamente — alguns navegadores
  // (Safari iOS) exigem que o usuário clique antes
  showCamPrompt('toque pra ligar a câmera', 'ligar câmera');
}

function showCamPrompt(text, buttonText, isError = false) {
  const prompt = $('camPrompt');
  prompt.hidden = false;
  prompt.classList.toggle('error', isError);
  $('camPromptText').textContent = text;
  $('camStart').textContent = buttonText || 'ligar câmera';
  // esconde a borda amarela enquanto câmera não tá ativa
  $('readerOverlay').hidden = true;
}

function hideCamPrompt() {
  $('camPrompt').hidden = true;
  $('readerOverlay').hidden = false;
}

async function listCameras() {
  try {
    const cams = await Html5Qrcode.getCameras();
    return cams || [];
  } catch {
    return [];
  }
}

function pickCamera(cams) {
  if (!cams.length) return null;
  // tenta achar câmera traseira (back / environment / rear / traseira)
  const back = cams.find((c) => /back|environment|rear|traseira/i.test(c.label));
  if (back) return back;
  // se tiver várias câmeras, a última costuma ser a traseira
  if (cams.length > 1) return cams[cams.length - 1];
  return cams[0];
}

function populateCamSelect(cams, currentId) {
  const sel = $('camSelect');
  sel.innerHTML = '';
  cams.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label || `câmera ${i + 1}`;
    if (c.id === currentId) opt.selected = true;
    sel.appendChild(opt);
  });
  $('camControls').hidden = cams.length < 2;
}

async function startCamera(cameraId) {
  // 1) verifica suporte do navegador
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCamPrompt(
      'seu navegador não suporta câmera. Tenta o Chrome ou Safari.',
      'ok',
      true
    );
    return;
  }

  // 2) verifica HTTPS (câmera não funciona em http://, só em https:// ou localhost)
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    showCamPrompt(
      'a câmera só funciona em HTTPS. abre o site pela URL da Vercel (https://...)',
      'ok',
      true
    );
    return;
  }

  hideCamPrompt();

  // 3) para câmera anterior se já tava rodando
  if (scanner) {
    try { await scanner.stop(); await scanner.clear(); } catch {}
  }

  scanner = new Html5Qrcode('qrReader');

  // 4) pega lista de câmeras (precisa de permissão concedida)
  let cams = await listCameras();
  let chosenId = cameraId;

  // se não tem câmera listada ainda, tenta começar com facingMode pra disparar a permissão
  if (!cams.length) {
    try {
      scanning = true;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
        onScan,
        () => {}
      );
      // re-lista depois que a permissão foi concedida
      cams = await listCameras();
      populateCamSelect(cams, scanner.getRunningTrackCameraCapabilities?.()?.deviceId);
      return;
    } catch (err) {
      handleCameraError(err);
      return;
    }
  }

  // 5) escolhe câmera
  if (!chosenId) {
    const cam = pickCamera(cams);
    chosenId = cam?.id;
  }
  populateCamSelect(cams, chosenId);

  if (!chosenId) {
    showCamPrompt('nenhuma câmera encontrada', 'tentar de novo', true);
    return;
  }

  // 6) inicia a câmera escolhida
  scanning = true;
  try {
    await scanner.start(
      chosenId,
      { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
      onScan,
      () => {}
    );
  } catch (err) {
    handleCameraError(err);
  }
}

function handleCameraError(err) {
  const raw = String(err?.message || err);
  let msg = raw;
  if (/NotAllowed|Permission/i.test(raw)) {
    msg = 'permissão da câmera foi negada. abre as configurações do navegador e libera.';
  } else if (/NotFound|DeviceNotFound/i.test(raw)) {
    msg = 'nenhuma câmera encontrada no dispositivo.';
  } else if (/NotReadable|TrackStartError/i.test(raw)) {
    msg = 'a câmera tá sendo usada por outro app. fecha o outro app e tenta de novo.';
  } else if (/OverconstrainedError|Constraint/i.test(raw)) {
    msg = 'a câmera selecionada não funciona. troca pra outra no menu acima.';
  } else if (/SecureContext|secure/i.test(raw)) {
    msg = 'câmera só funciona em HTTPS. abre pela URL da Vercel.';
  }
  showCamPrompt(msg, 'tentar de novo', true);
  console.error('[cam] erro:', err);
}

// botões de controle
document.addEventListener('DOMContentLoaded', () => {
  $('camStart')?.addEventListener('click', () => startCamera());
  $('camRestart')?.addEventListener('click', () => {
    const sel = $('camSelect');
    startCamera(sel?.value || null);
  });
  $('camSelect')?.addEventListener('change', (e) => startCamera(e.target.value));
});

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
