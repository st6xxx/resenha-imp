/* ============================================
   INGRESSO · busca tickets + renderiza QR codes
============================================ */

// Extrai groupId da URL: pode vir como /ingresso/<id> ou /ingresso.html?id=<id>
function getGroupId() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('id');
  if (fromQuery) return fromQuery;
  const parts = window.location.pathname.split('/').filter(Boolean);
  // /ingresso/<id> → ['ingresso', '<id>']
  if (parts[0] === 'ingresso' && parts[1]) return parts[1];
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
  return `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=${encodeURIComponent(ticketId)}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function render(tickets) {
  $('loader').hidden = true;
  $('ticketList').hidden = false;
  $('footer').hidden = false;

  const list = $('ticketList');
  list.innerHTML = '';

  const groupId = getGroupId();

  tickets.forEach((t, i) => {
    const usedClass = t.used ? ' used' : '';
    const individualUrl = `/ingresso/${encodeURIComponent(groupId)}/${encodeURIComponent(t.ticketId)}`;
    const statusTxt = t.used
      ? `usado em ${new Date(t.usedAt).toLocaleString('pt-BR')}`
      : '✓ válido · pronto pra entrar';
    const genderClass = `gender-${escapeHtml(t.gender)}`;

    const a = document.createElement('a');
    a.className = 'ticket-row' + usedClass;
    a.href = individualUrl;
    a.style.animationDelay = `${i * 0.06}s`;
    a.innerHTML = `
      <span class="row-num">${i + 1}</span>
      <div class="row-body">
        <h2 class="row-name">${escapeHtml(t.name) || '(sem nome)'}</h2>
        <div class="row-meta">
          <span class="row-gender ${genderClass}">${escapeHtml(t.gender)}</span>
          <span class="row-status">${statusTxt}</span>
        </div>
      </div>
      <span class="row-arrow" aria-hidden="true">→</span>
    `;
    list.appendChild(a);
  });

  const used = tickets.filter((t) => t.used).length;
  $('stats').textContent = `${tickets.length} ingresso${tickets.length !== 1 ? 's' : ''} · ${used} já usado${used !== 1 ? 's' : ''}`;
}

async function load() {
  const groupId = getGroupId();
  if (!groupId) {
    showError('link inválido. Verifique se copiou a URL completa.');
    return;
  }

  try {
    const res = await fetch(`/api/get-tickets?group=${encodeURIComponent(groupId)}`);
    const data = await res.json();

    if (!data.ok) {
      showError(data.error || 'não foi possível carregar.');
      return;
    }

    if (!data.tickets || data.tickets.length === 0) {
      showError(
        'ainda não encontramos seus ingressos. Se você acabou de pagar, aguarde uns segundos e atualize a página.'
      );
      return;
    }

    render(data.tickets);
  } catch (err) {
    showError('erro de conexão. Tenta novamente em alguns segundos.');
    console.error(err);
  }
}

// ações do rodapé
$('copyLink').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    toast('✓ link copiado');
  } catch {
    toast('não rolou copiar :(');
  }
});

$('waLink').addEventListener('click', () => {
  const txt = `Meus ingressos da RESENHA IMP 🎟️%0A${encodeURIComponent(window.location.href)}`;
  window.open(`https://wa.me/?text=${txt}`, '_blank');
});

load();
