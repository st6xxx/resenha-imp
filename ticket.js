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

function qrUrl(ticketId) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data=${encodeURIComponent(ticketId)}`;
}

function render(ticket) {
  $('loader').hidden = true;
  $('single').hidden = false;

  $('name').textContent = ticket.name || '(sem nome)';
  $('gender').textContent = ticket.gender || 'Indeciso';
  $('gender').className = 'gender-pill ' + (ticket.gender || 'Indeciso');
  $('code').textContent = '#' + ticket.ticketId;
  $('qrImg').src = qrUrl(ticket.ticketId);

  // status
  const status = $('status');
  const qrBox = $('qrBox');
  if (ticket.used) {
    status.textContent = 'usado em ' + new Date(ticket.usedAt).toLocaleString('pt-BR');
    status.classList.add('used');
    qrBox.classList.add('used');
  } else {
    status.textContent = '✓ válido · pronto pra entrar';
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
