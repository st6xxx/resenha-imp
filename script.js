/* ============================================
   RESENHA IMP — JS
============================================ */

const PRECO_BASE = 60;
const MAX = 10;

// ⚠️  CONFIGURAR ANTES DE COMPARTILHAR:
// 1. Crie um "Link de pagamento" no painel do Mercado Pago
//    (https://www.mercadopago.com.br/cobrar) com valor flexível
// 2. Cole a URL aqui (algo como https://mpago.la/XXXXXX)
const MP_LINK = 'https://mpago.la/SEU_LINK_AQUI';

// 3. WhatsApp do anfitrião pra dúvidas (DDI+DDD+número, sem espaços)
const WHATSAPP = '5521995692704';

// ⚠️ A gravação no Google Sheets agora é feita AUTOMATICAMENTE pelo webhook
//    no servidor (api/webhook.js) quando o MP confirma o pagamento.
//    A URL da planilha vai na env var SHEETS_URL da Vercel (NÃO aqui no front).

// preço por pessoa cai conforme o grupo cresce
function precoPorPessoa(qtd) {
  return 1; // ⚠️ MODO TESTE · apague essa linha pra voltar aos preços reais (60/55/52/50/48)
  if (qtd >= 10) return 48;
  if (qtd >= 7)  return 50;
  if (qtd >= 5)  return 52;
  if (qtd >= 3)  return 55;
  return 60;
}

// índice da faixa (pra destacar visualmente)
function indiceFaixa(qtd) {
  if (qtd >= 10) return 4;
  if (qtd >= 7)  return 3;
  if (qtd >= 5)  return 2;
  if (qtd >= 3)  return 1;
  return 0;
}

const qtyEl     = document.getElementById('qty');
const minusBtn  = document.getElementById('minus');
const plusBtn   = document.getElementById('plus');
const ppEl      = document.getElementById('perPerson');
const discEl    = document.getElementById('discount');
const totalEl   = document.getElementById('total');
const mpAmountEl = document.getElementById('mpAmount');
const tierCards = document.querySelectorAll('.tier');

let qty = 1;

function fmt(n) {
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(',00', '');
}

function popTotal() {
  const span = totalEl;
  span.classList.remove('pop');
  void span.offsetWidth;     // força reflow pra reiniciar animação
  span.classList.add('pop');
}

function render(animate) {
  const pp = precoPorPessoa(qty);
  const total = qty * pp;
  const economia = qty * (PRECO_BASE - pp);

  qtyEl.textContent = qty;
  ppEl.textContent = fmt(pp);
  discEl.textContent = economia > 0 ? fmt(economia) : '—';
  totalEl.textContent = fmt(total);
  if (mpAmountEl) mpAmountEl.textContent = fmt(total);

  minusBtn.disabled = qty <= 1;
  plusBtn.disabled  = qty >= MAX;

  const idx = indiceFaixa(qty);
  tierCards.forEach((c, i) => {
    if (i === idx && !c.classList.contains('active')) {
      c.classList.add('active');
    } else if (i !== idx) {
      c.classList.remove('active');
    }
  });

  // sincroniza a lista de nomes com a quantidade
  syncNameRows();

  if (animate) {
    popTotal();
    if (mpAmountEl) {
      mpAmountEl.classList.remove('bump');
      void mpAmountEl.offsetWidth;
      mpAmountEl.classList.add('bump');
    }
  }
}

// ===== CONFETE =====
function burst(srcEl) {
  const rect = srcEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ['#ff3ea5', '#ffd93d', '#00e5ff', '#c5ff3d', '#ff7a00', '#8b5cf6'];

  for (let i = 0; i < 14; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    const angle = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.6;
    const dist = 60 + Math.random() * 70;
    p.style.left = cx + 'px';
    p.style.top  = cy + 'px';
    p.style.setProperty('--c',  colors[i % colors.length]);
    p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
    p.style.setProperty('--r',  (Math.random() * 720 - 360) + 'deg');
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

minusBtn.addEventListener('click', (e) => {
  if (qty > 1) {
    qty--;
    render(true);
    burst(e.currentTarget);
    if (window.buzz) window.buzz(10);
  }
});
plusBtn.addEventListener('click', (e) => {
  if (qty < MAX) {
    qty++;
    render(true);
    burst(e.currentTarget);
    if (window.buzz) window.buzz(10);
  }
});

// ===== TOAST =====
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ============================================
//  IA DE GÊNERO (heurística offline)
// ============================================
//
// Como funciona:
// 1. Normaliza o nome (minúsculas, sem acento, primeiro nome só)
// 2. Procura no dicionário de nomes brasileiros conhecidos
// 3. Se não achou, tenta regras de sufixo (mais específicas primeiro)
// 4. Se nada bater, devolve "?" (indeciso)
//
// Pra estender: adicione nomes nas listas FEMALE_NAMES / MALE_NAMES.

const FEMALE_NAMES = `
  maria ana julia sofia sophia helena isabella isabela laura manuela beatriz mariana
  camila larissa leticia bianca amanda carla patricia fernanda aline adriana carolina
  caroline cristina daniela debora eduarda elaine eliane erica fabiana flavia gabriela
  heloisa joana juliana kelly lara lavinia livia lorena luana luiza luisa marcela
  marina mayara melissa mirella monique natalia nicole olivia paula priscila rafaela
  raquel raissa rebeca regina renata rita roberta rosa sabrina sandra sara sarah
  silvia simone stephanie taina tatiana teresa thais vanessa vera vitoria yasmin
  alice agatha alicia ayla cecilia cibele clara denise diana eloisa esther fatima
  gisele iara isadora joice katia lais leila luma melina nadia nayara penelope
  rute selena talia tania tereza valentina veronica yara zilda elis emanuelle
  emanuela vivian viviane jessica francisca lucia luciana suzana susana solange
  fabiola monica mara karen carmen ester maite milena mila isis hadassa antonella
  alessandra alessia ariel ana-clara aparecida aurora barbara bruna carine cassia
  cintia cinthia cristiane cristiana dalva edna elen elena elena ester eva
  geisa geovana giovana giovanna giulia greice ingrid janaina jamila jaqueline
  joelma kamila katiuscia keila lidia liliane luma magda marcia margarete marta
  mercedes naiara nathalia neusa odete pamela poliana rayssa rosana rosane
  rosangela samara samira sheila silmara simara sirlene tabata tatiane vivian
  yara yasmim
`.split(/\s+/).filter(Boolean);

const MALE_NAMES = `
  pedro joao lucas gabriel rafael bruno ricardo marcos daniel felipe diego thiago
  tiago matheus mateus paulo carlos andre rodrigo eduardo gustavo henrique leonardo
  caio vinicius igor murilo renato roberto anderson fernando fabio antonio adriano
  alex arthur augusto bernardo breno bryan cesar cristiano davi david denis douglas
  edson emerson enzo eric erick estevao filipe francisco gilberto guilherme heitor
  hugo ian ivan jair jeferson jefferson jonas jorge jose julio kaue kevin lazaro
  leo leon levi lorenzo luan luiz luis manoel manuel marcelo marcio mario mauricio
  miguel nelson nicolas otavio pablo patrick raul renan rogerio romeu ronaldo
  samuel sergio silvio silas tales thales theo tomas tulio valter vicente vitor
  victor wagner wesley william yago yuri abel adilson aelton agnaldo aires alan
  alberto aldo aleixo alencar alexandre alvaro amaro amauri ananias antenor
  arnaldo aroldo aron asaf benjamim benoni cleber cleiton cristian darcy ederson
  edmilson edson elcio eli elias eliseu evandro everton ezequiel fagner geraldo
  gilmar gilson gledson hamilton helio heraldo herculano hermes hilton ismael
  itamar ivair jadir jadson jander janio jeremias jhon jhonatan joaquim jonathan
  juarez juvenal kayky leandro lindomar marcio mario marlos martin maycon mayron
  micael moacir moises moisés natanael nivaldo norberto odair olavo omar orlando
  oscar otoniel pascoal renato robson romario ruan sandro sebastiao silas tarcisio
  ubirajara ulisses uriel valdeci valdir vagner valentim valmir wallace walter
  wanderlei washington wellington welson wendell wesley wilson zeca
`.split(/\s+/).filter(Boolean);

// Mapa de lookup: nome → 'F' ou 'M'
const NAMES_DB = (() => {
  const db = Object.create(null);
  FEMALE_NAMES.forEach(n => db[n] = 'F');
  MALE_NAMES.forEach(n => db[n] = 'M');
  return db;
})();

// Regras de sufixo — mais longas/específicas primeiro
const SUFFIXES = [
  // Femininos específicos
  { ends: 'iana',  g: 'F' },
  { ends: 'iela',  g: 'F' },
  { ends: 'iane',  g: 'F' },
  { ends: 'inha',  g: 'F' },
  { ends: 'ssa',   g: 'F' },
  { ends: 'ana',   g: 'F' },
  { ends: 'ela',   g: 'F' },
  { ends: 'ina',   g: 'F' },
  { ends: 'lia',   g: 'F' },
  { ends: 'isa',   g: 'F' },
  { ends: 'ara',   g: 'F' },
  { ends: 'ette',  g: 'F' },
  // Masculinos específicos
  { ends: 'son',   g: 'M' },
  { ends: 'aldo',  g: 'M' },
  { ends: 'ardo',  g: 'M' },
  { ends: 'erto',  g: 'M' },
  { ends: 'iel',   g: 'M' },
  { ends: 'inho',  g: 'M' },
  { ends: 'andro', g: 'M' },
  { ends: 'ielson',g: 'M' },
  // Fallback genérico
  { ends: 'a',     g: 'F' },
  { ends: 'o',     g: 'M' },
];

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')                  // separa letra e acento
    .replace(/[̀-ͯ]/g, '')   // remove os acentos
    .replace(/[^a-z\s-]/g, '')         // só letras, espaço e hífen
    .trim();
}

function predictGender(name) {
  if (!name || !name.trim()) return '?';
  const first = normalize(name).split(/[\s-]+/)[0];
  if (!first || first.length < 2) return '?';
  if (NAMES_DB[first]) return NAMES_DB[first];
  for (const r of SUFFIXES) {
    if (first.endsWith(r.ends)) return r.g;
  }
  return '?';
}

// ============================================
//  LISTA DE NOMES (inline, sincronizada com qty)
// ============================================
const nameRows = []; // [{name, gender, manual}]

function buildOneRow(idx) {
  const row = document.createElement('div');
  row.className = 'name-row';
  row.innerHTML = `
    <span class="name-num">${idx + 1}</span>
    <input type="text" class="name-input" placeholder="nome da pessoa..." autocomplete="off" spellcheck="false" />
    <span class="ai-mark" title="previsão da IA">🤖</span>
    <div class="gender-pills">
      <button type="button" class="gp" data-g="F" aria-label="mulher">♀</button>
      <button type="button" class="gp" data-g="M" aria-label="homem">♂</button>
      <button type="button" class="gp" data-g="?" aria-label="indeciso">?</button>
    </div>
  `;
  const input = row.querySelector('.name-input');
  input.addEventListener('input', (e) => onNameChange(idx, e.target.value));

  row.querySelectorAll('.gp').forEach((btn) => {
    btn.addEventListener('click', () => setGender(idx, btn.dataset.g));
  });

  return row;
}

// adiciona/remove linhas pra bater com qty SEM rebuildar tudo
// (mantém foco do input quando aumenta/diminui o counter)
function syncNameRows() {
  const list = document.getElementById('namesList');
  if (!list) return;

  while (nameRows.length < qty) {
    nameRows.push({ name: '', gender: '?', manual: false });
    list.appendChild(buildOneRow(nameRows.length - 1));
  }
  while (nameRows.length > qty) {
    nameRows.pop();
    if (list.lastElementChild) list.removeChild(list.lastElementChild);
  }
  renderAllRows();
  updateSummary();
}

function onNameChange(idx, value) {
  nameRows[idx].name = value;
  // só atualiza se a pessoa não fez override manual
  if (!nameRows[idx].manual) {
    nameRows[idx].gender = predictGender(value);
  }
  renderRow(idx);
  updateSummary();
}

function setGender(idx, g) {
  nameRows[idx].gender = g;
  nameRows[idx].manual = true;
  renderRow(idx);
  updateSummary();
}

function renderRow(idx) {
  const rows = document.querySelectorAll('#namesList .name-row');
  const rowEl = rows[idx];
  if (!rowEl) return;
  const { gender, manual, name } = nameRows[idx];

  rowEl.querySelectorAll('.gp').forEach((p) => {
    p.classList.toggle('active', p.dataset.g === gender);
  });

  // mostra o robôzinho só quando há nome E foi a IA quem decidiu
  const predicted = !manual && name.trim().length >= 2 && gender !== '?';
  rowEl.classList.toggle('predicted', predicted);
  rowEl.classList.toggle('manual', manual);
}

function renderAllRows() {
  nameRows.forEach((_, i) => renderRow(i));
}

function updateSummary() {
  const counts = { F: 0, M: 0, '?': 0 };
  nameRows.forEach((r) => counts[r.gender]++);
  const total = nameRows.length;
  const el = document.getElementById('namesSummary');
  if (!el) return;
  el.innerHTML = `
    <strong>${total}</strong> ${total === 1 ? 'pessoa' : 'pessoas'} ·
    <strong>${counts.M}</strong> ${counts.M === 1 ? 'homem' : 'homens'} ·
    <strong>${counts.F}</strong> ${counts.F === 1 ? 'mulher' : 'mulheres'} ·
    <strong>${counts['?']}</strong> ${counts['?'] === 1 ? 'indeciso' : 'indecisos'}
  `;
}

// ============================================
//  PAGAMENTO via Mercado Pago (automático)
// ============================================
// Fluxo:
// 1. Chama a função serverless /api/create-payment
// 2. Recebe a URL de checkout do MP (com valor + itens já preenchidos)
// 3. Redireciona o usuário pra lá
// Se a API não responder (ex: site rodando sem backend), faz fallback
// pro fluxo antigo (copiar valor + abrir link estático).
async function pagarMP() {
  const pp = precoPorPessoa(qty);
  const total = qty * pp;
  const valor = fmt(total);
  const buyer = (nameRows[0] && nameRows[0].name.trim()) || '';

  // valida email — obrigatório, é onde os ingressos serão enviados
  const emailInput = document.getElementById('buyerEmail');
  const emailErr = document.getElementById('emailError');
  const email = (emailInput?.value || '').trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    if (emailInput) { emailInput.classList.add('invalid'); emailInput.focus(); }
    if (emailErr)   { emailErr.hidden = false; emailErr.textContent = email ? 'email inválido' : 'precisa colocar email pra receber os ingressos'; }
    toast('⚠️ preencha um email válido');
    document.querySelector('.email-block')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (emailInput) emailInput.classList.remove('invalid');
  if (emailErr) emailErr.hidden = true;

  // botão em estado de loading
  const btn = document.querySelector('.pay-stack .btn-primary.big');
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  if (window.buzz) window.buzz([15, 20, 15]); // tap-tap-tap confirmando
  toast('preparando pagamento...');

  try {
    const res = await fetch('/api/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qty,
        pricePerPerson: pp,
        buyer,
        email,
        people: nameRows.map((r) => ({
          name: r.name.trim(),
          gender: r.gender,
          manual: r.manual
        }))
      })
    });

    if (!res.ok) throw new Error('API_FAIL_' + res.status);

    const data = await res.json();
    if (!data.init_point) throw new Error('NO_INIT_POINT');

    // guarda o group_id pra mostrar link de ingresso quando voltar do MP
    if (data.group_id) {
      localStorage.setItem('resenha_last_group', data.group_id);
    }

    // tudo certo — redireciona pro checkout com valor pré-preenchido
    toast('✓ redirecionando pro Mercado Pago...');
    setTimeout(() => { window.location.href = data.init_point; }, 250);
    return;

  } catch (err) {
    console.warn('[mp] checkout automático falhou, usando fallback:', err);
    // FALLBACK: copia o valor e abre o link estático
    try {
      await navigator.clipboard.writeText(valor);
      toast(`✓ ${valor} copiado · cole no Mercado Pago`);
    } catch {
      toast('abrindo Mercado Pago...');
    }
    setTimeout(() => window.open(MP_LINK, '_blank'), 350);

  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  }
}
window.pagarMP = pagarMP;

// ===== CONFIRMAR via WhatsApp =====
function comprar() {
  const msg = 'Oi! Quero confirmar presença na RESENHA IMP';
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
}
window.comprar = comprar;

// ===== PARALLAX SUAVE NOS BLOBS =====
(function () {
  const blobs = document.querySelectorAll('.blob');
  if (!blobs.length) return;
  let raf = null;
  let mx = 0, my = 0;

  window.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      blobs.forEach((b, i) => {
        const f = (i + 1) * 14;
        b.style.translate = `${mx * f}px ${my * f}px`;
      });
      raf = null;
    });
  });
})();

// ===== REVEAL ON SCROLL =====
(function () {
  if (!('IntersectionObserver' in window)) return;
  const targets = document.querySelectorAll('.hl-card, .tix-card');
  targets.forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(28px)';
    el.style.transition = 'opacity 0.7s ease-out, transform 0.7s cubic-bezier(.2,.8,.2,1)';
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });

  targets.forEach((el) => io.observe(el));
})();

// ============================================
//  EFEITOS EXTRAS — sparkles, tilt, magnetic, ripple
// ============================================

const isTouchDevice = () => window.matchMedia('(hover: none)').matches;
const isMobile = () => window.innerWidth <= 600;
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// haptic feedback nos botões importantes (só Android; iOS ignora silenciosamente)
window.buzz = function buzz(pattern) {
  if (navigator.vibrate && !prefersReducedMotion()) {
    try { navigator.vibrate(pattern); } catch {}
  }
};

// ---- SPARKLES aleatórios pela página ----
(function setupSparkles() {
  if (prefersReducedMotion()) return;
  const colors = ['', 'pink', 'cyan', 'lime', 'purple']; // '' = amarelo (default)
  // mobile = sparkles menos frequentes (economiza bateria + menos visual noise)
  const intervalMs = isMobile() ? 1600 : 700;
  const welcomeCount = isMobile() ? 4 : 8;

  function spawn() {
    // não spawna quando a aba tá em background
    if (document.hidden) return;
    const s = document.createElement('span');
    s.className = 'sparkle ' + colors[Math.floor(Math.random() * colors.length)];
    s.style.left = Math.random() * window.innerWidth + 'px';
    s.style.top  = Math.random() * window.innerHeight + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1500);
  }
  setInterval(spawn, intervalMs);
  for (let i = 0; i < welcomeCount; i++) setTimeout(spawn, i * 140);
})();

// ---- CURSOR GLOW (só desktop) ----
(function setupCursorGlow() {
  if (isTouchDevice()) return;
  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  document.body.appendChild(glow);

  let rafId = null;
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let currentX = targetX, currentY = targetY;

  window.addEventListener('mousemove', (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
    if (!rafId) loop();
  });

  function loop() {
    // segue o cursor com lag suave
    currentX += (targetX - currentX) * 0.15;
    currentY += (targetY - currentY) * 0.15;
    glow.style.left = currentX + 'px';
    glow.style.top  = currentY + 'px';
    if (Math.abs(targetX - currentX) > 0.5 || Math.abs(targetY - currentY) > 0.5) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
    }
  }
})();

// ---- TILT 3D em cards (só desktop) ----
(function setupTilt() {
  if (isTouchDevice()) return;
  const cards = document.querySelectorAll('.hl-card, .tier');
  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -8; // -8 a 8 graus
      const rotateY = ((x - centerX) / centerX) * 8;
      card.classList.add('tilting');
      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px) scale(1.02)`;
    });
    card.addEventListener('mouseleave', () => {
      card.classList.remove('tilting');
      card.style.transform = '';
    });
  });
})();

// ---- MAGNETIC BUTTONS (só desktop, GPU + rAF + rect cacheado) ----
(function setupMagnetic() {
  if (isTouchDevice() || prefersReducedMotion()) return;
  // só botões grandes — magnetic em counter +/- não faz sentido
  const buttons = document.querySelectorAll('.btn-primary');

  buttons.forEach((btn) => {
    let rafId = null;
    let cx = 0, cy = 0;          // posição atual (lerpada)
    let tx = 0, ty = 0;          // posição alvo
    let cachedRect = null;       // rect SEM transform aplicado
    let active = false;

    function measure() {
      // tira o transform temporariamente pra pegar o rect REAL (sem distorção)
      const prev = btn.style.transform;
      btn.style.transform = '';
      cachedRect = btn.getBoundingClientRect();
      btn.style.transform = prev;
    }

    function loop() {
      // interpolação suave (lerp) — quanto menor, mais lento/suave
      const ease = 0.18;
      cx += (tx - cx) * ease;
      cy += (ty - cy) * ease;

      // se chegou perto o suficiente do alvo, para
      const close = Math.abs(tx - cx) < 0.15 && Math.abs(ty - cy) < 0.15;
      if (close) {
        cx = tx;
        cy = ty;
      }

      if (active || !close) {
        // translate3d ativa aceleração de GPU + não causa reflow
        btn.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      } else if (Math.abs(cx) < 0.2 && Math.abs(cy) < 0.2) {
        // chegou em (0,0) e mouse não tá mais em cima — limpa pra CSS retomar
        btn.style.transform = '';
      }

      if (!close || active) {
        rafId = requestAnimationFrame(loop);
      } else {
        rafId = null;
      }
    }

    btn.addEventListener('mouseenter', () => {
      measure();
      active = true;
      if (!rafId) rafId = requestAnimationFrame(loop);
    });

    btn.addEventListener('mousemove', (e) => {
      if (!cachedRect) return;
      const px = e.clientX - cachedRect.left - cachedRect.width / 2;
      const py = e.clientY - cachedRect.top - cachedRect.height / 2;
      // strength reduzido (0.18) pra ficar sutil
      tx = px * 0.18;
      ty = py * 0.18;
    });

    btn.addEventListener('mouseleave', () => {
      active = false;
      tx = 0;
      ty = 0;
      if (!rafId) rafId = requestAnimationFrame(loop);
    });

    // re-mede quando scroll/resize mudam o layout
    window.addEventListener('scroll', () => { if (active) measure(); }, { passive: true });
    window.addEventListener('resize', () => { if (active) measure(); });
  });
})();

// ---- RIPPLE em cliques ----
(function setupRipple() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top  = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 750);
  });
})();

// ---- NUMBER POP — observa os valores e anima quando mudam ----
(function watchNumberChanges() {
  const ids = ['perPerson', 'discount', 'mpAmount'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    let last = el.textContent;
    const obs = new MutationObserver(() => {
      if (el.textContent === last) return;
      last = el.textContent;
      el.style.transform = 'scale(1.18)';
      setTimeout(() => { el.style.transform = ''; }, 320);
    });
    obs.observe(el, { childList: true, characterData: true, subtree: true });
  });
})();

// render inicial — DEPOIS de tudo estar declarado (nameRows, syncNameRows, etc)
render(false);

// ===== retorno do Mercado Pago =====
// Quando o MP redireciona de volta, vem com ?status=success|pending|failure.
// Se foi aprovado, mostra banner com link vitalício dos ingressos.
(function () {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');
  if (!status) return;

  history.replaceState({}, '', window.location.pathname);

  if (status === 'success') {
    const groupId = localStorage.getItem('resenha_last_group');
    if (groupId) {
      showSuccessBanner(groupId);
    } else {
      setTimeout(() => toast('🎉 pagamento aprovado · te vejo na festa!'), 400);
    }
  } else if (status === 'pending') {
    setTimeout(() => toast('⏳ pagamento pendente · em alguns minutos cai'), 400);
  } else if (status === 'failure') {
    setTimeout(() => toast('✗ pagamento não rolou · tenta de novo?'), 400);
  }
})();

function showSuccessBanner(groupId) {
  const url = `${window.location.origin}/ingresso/${groupId}`;
  const banner = document.createElement('div');
  banner.className = 'success-banner';
  banner.innerHTML = `
    <div class="sb-card">
      <div class="sb-emoji">🎉</div>
      <h2>Pagamento aprovado!</h2>
      <p>Seus ingressos já estão prontos. <strong>Salve esse link</strong> — é vitalício e só você tem ele.</p>
      <div class="sb-url">${url}</div>
      <div class="sb-actions">
        <a class="btn btn-primary big" href="/ingresso/${groupId}">ver meus ingressos →</a>
        <button class="btn btn-ghost" id="sbCopy">copiar link</button>
        <button class="btn btn-ghost" id="sbWa">mandar pro whatsapp</button>
      </div>
      <button class="sb-close" aria-label="fechar">×</button>
    </div>
  `;
  document.body.appendChild(banner);

  banner.querySelector('#sbCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); toast('✓ link copiado'); } catch {}
  });
  banner.querySelector('#sbWa').addEventListener('click', () => {
    const txt = `Meus ingressos da RESENHA IMP 🎟️%0A${encodeURIComponent(url)}`;
    window.open(`https://wa.me/?text=${txt}`, '_blank');
  });
  banner.querySelector('.sb-close').addEventListener('click', () => banner.remove());
}
