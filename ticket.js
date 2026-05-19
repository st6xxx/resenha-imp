/* ============================================
   TICKET INDIVIDUAL · busca e renderiza um QR
============================================ */

// URL pode vir como: /ingresso/<group>/<ticket>  ou  /ticket.html?id=<ticket>
function getTicketId() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('ticket') || params.get('id');
  if (fromQuery) return fromQuery;

  const parts = window.location.pathname.split('/').filter(Boolean);
  // /ingresso/<group>/<ticket>
  if (parts[0] === 'ingresso' && parts.length >= 3) return parts[2];
  return '';
}

const $ = (id) => document.getElementById(id);

function showError(msg) {
  $('loader').hidden = true;
  $('error').hidden = false;
  $('errorMsg').textContent = msg;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function qrUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data=${encodeURIComponent(data)}`;
}

// ===== TOKEN ROTATIVO =====
// busca um novo token assinado do servidor (válido por 10s)
async function fetchRotatingToken(ticketId) {
  const r = await fetch(`/api/refresh-qr?ticket=${encodeURIComponent(ticketId)}`);
  if (!r.ok) throw new Error('refresh failed');
  return r.json();
}

let qrRefreshTimer = null;
let qrCountdownTimer = null;

// quanto antes de expirar a gente já pega o próximo token
// (sobreposição garante que nunca tem QR "morto" na tela)
const REFRESH_LEAD_MS = 1500;

async function refreshQrAndCountdown(ticketId) {
  const overlay = $('qrRefreshOverlay');
  if (overlay) overlay.hidden = false;
  try {
    const data = await fetchRotatingToken(ticketId);
    if (!data.ok || !data.qr) throw new Error('no token');

    // atualiza o QR
    $('qrImg').src = qrUrl(data.qr);

    // contagem regressiva baseada no expires_at REAL desse token específico
    const expiresAt = data.expires_at;
    const validMs = data.valid_ms || 10000;
    startCountdown(expiresAt, validMs);

    // agenda o próximo refresh — em vez de a cada 10s no relógio,
    // alinha com a expiração DESSE token (sempre 1.5s antes)
    if (qrRefreshTimer) clearTimeout(qrRefreshTimer);
    const refreshIn = Math.max(500, expiresAt - Date.now() - REFRESH_LEAD_MS);
    qrRefreshTimer = setTimeout(() => refreshQrAndCountdown(ticketId), refreshIn);
  } catch (err) {
    console.error('[qr] erro ao atualizar:', err);
    // tenta de novo em 3s
    if (qrRefreshTimer) clearTimeout(qrRefreshTimer);
    qrRefreshTimer = setTimeout(() => refreshQrAndCountdown(ticketId), 3000);
  } finally {
    setTimeout(() => { if (overlay) overlay.hidden = true; }, 200);
  }
}

function startCountdown(expiresAt, validMs) {
  if (qrCountdownTimer) clearInterval(qrCountdownTimer);
  const bar = $('countdownBar');
  const txt = $('countdownText');
  const wrap = $('countdown');

  function tick() {
    const left = Math.max(0, expiresAt - Date.now());
    const leftSec = Math.ceil(left / 1000);
    const pct = Math.max(0, Math.min(1, left / validMs));
    if (bar) bar.style.transform = `scaleX(${pct})`;
    if (txt) txt.textContent = `🔄 renova em ${leftSec}s`;
    if (wrap) wrap.classList.toggle('urgent', leftSec <= 3);
    if (left <= 0) clearInterval(qrCountdownTimer);
  }
  tick();
  qrCountdownTimer = setInterval(tick, 200);
}

function startRotation(ticketId) {
  // só dispara o ciclo — refreshQrAndCountdown se reagenda sozinho
  refreshQrAndCountdown(ticketId);
}

function stopRotation() {
  if (qrRefreshTimer) { clearTimeout(qrRefreshTimer); qrRefreshTimer = null; }
  if (qrCountdownTimer) { clearInterval(qrCountdownTimer); qrCountdownTimer = null; }
}

// reaproveita o ciclo quando o app volta do background (mobile)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentTicketId && !currentTicketUsed) {
    refreshQrAndCountdown(currentTicketId);
  }
});

let currentTicketId = null;
let currentTicketUsed = false;

function render(ticket) {
  $('loader').hidden = true;
  $('single').hidden = false;

  $('name').textContent = ticket.name || '(sem nome)';
  $('gender').textContent = ticket.gender || 'Indeciso';
  $('gender').className = 'gender-pill ' + (ticket.gender || 'Indeciso');
  $('code').textContent = '#' + ticket.ticketId;

  // status
  const status = $('status');
  const qrBox = $('qrBox');
  const countdown = $('countdown');

  currentTicketId = ticket.ticketId;
  currentTicketUsed = !!ticket.used;

  if (ticket.used) {
    status.textContent = 'usado em ' + new Date(ticket.usedAt).toLocaleString('pt-BR');
    status.classList.add('used');
    qrBox.classList.add('used');
    // ticket já usado: mostra QR estático (não tem mais valor) e some o contador
    $('qrImg').src = qrUrl(ticket.ticketId);
    if (countdown) countdown.hidden = true;
  } else {
    status.textContent = '✓ válido · pronto pra entrar';
    // ticket válido: inicia rotação de token
    startRotation(ticket.ticketId);
  }

  // links do grupo
  const groupUrl = ticket.groupId ? `/ingresso/${ticket.groupId}` : '/';
  $('backToGroup').href = groupUrl;
  $('seeGroup').href = groupUrl;
}

async function load() {
  const ticketId = getTicketId();
  if (!ticketId) {
    showError('link inválido.');
    return;
  }

  try {
    const res = await fetch(`/api/get-ticket?id=${encodeURIComponent(ticketId)}`);
    const data = await res.json();

    if (!data.ok || !data.ticket) {
      showError(data.error === 'ticket_not_found'
        ? 'esse ingresso não existe (ou ainda está sendo gerado — espera uns segundos e atualiza)'
        : (data.error || 'não foi possível carregar.'));
      return;
    }

    render(data.ticket);
  } catch (err) {
    showError('erro de conexão. Tenta novamente.');
    console.error(err);
  }
}

$('copyLink').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    toast('✓ link copiado');
  } catch { toast('não rolou copiar :('); }
});

$('waLink').addEventListener('click', () => {
  const txt = `Meu ingresso da RESENHA IMP 🎟️%0A${encodeURIComponent(window.location.href)}`;
  window.open(`https://wa.me/?text=${txt}`, '_blank');
});

load();
