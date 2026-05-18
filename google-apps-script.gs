/**
 * ============================================
 *  RESENHA IMP — Google Apps Script
 * ============================================
 *
 * Banco de dados em planilha pra:
 *   • Receber confirmações de pagamento (webhook do MP)
 *   • Gerar ingressos com ticket_id único pra cada pessoa
 *   • Listar ingressos de um grupo
 *   • Validar ingresso na entrada (anti-reentrada)
 *   • Estatísticas pro painel admin
 *
 * Roteia por `action` no corpo da requisição.
 */

const HEADERS = [
  'Data/Hora',
  'Pago em',
  'Nome',
  'Gênero',
  'Comprador',
  'Tamanho do Grupo',
  'Por Pessoa',
  'Total',
  'Payment ID',
  'E-mail',
  'Status',
  'Ticket ID',
  'Group ID',
  'Usado',
  'Usado em'
];

const COL = {
  recebidoEm: 1,
  pagoEm: 2,
  nome: 3,
  genero: 4,
  comprador: 5,
  grupoTamanho: 6,
  porPessoa: 7,
  total: 8,
  paymentId: 9,
  email: 10,
  status: 11,
  ticketId: 12,
  groupId: 13,
  usado: 14,
  usadoEm: 15
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action || 'create_tickets';

    switch (action) {
      case 'create_tickets':  return handleCreateTickets(body);
      case 'list_tickets':    return handleListTickets(body);
      case 'get_ticket':      return handleGetTicket(body);
      case 'validate_ticket': return handleValidateTicket(body);
      case 'admin_stats':     return handleAdminStats(body);
      default:                return json({ ok: false, error: 'unknown_action', action: action });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return ContentService.createTextOutput('RESENHA IMP API · ok ✦');
}

// ===== Helpers =====
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#ffd93d')
      .setFontColor('#0d0820');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function genTicketId() {
  // sem caracteres confundíveis (0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 12; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

function asBool(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 'Sim' || v === 1;
}

// ===== Ações =====

function handleCreateTickets(data) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const sheet = getSheet();

    // Dedup por Payment ID
    if (data.paymentId) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const ids = sheet.getRange(2, COL.paymentId, lastRow - 1, 1).getValues();
        for (let i = 0; i < ids.length; i++) {
          if (String(ids[i][0]) === String(data.paymentId)) {
            return json({ ok: true, skipped: 'duplicate', paymentId: data.paymentId });
          }
        }
      }
    }

    const now = new Date();
    const tickets = [];
    const people = data.people || [];

    people.forEach(function (p) {
      const ticketId = genTicketId();
      tickets.push({ ticketId: ticketId, name: p.name, gender: p.gender });

      sheet.appendRow([
        now,
        data.paidAt ? new Date(data.paidAt) : '',
        p.name || '(sem nome)',
        p.gender === 'F' ? 'Mulher' : (p.gender === 'M' ? 'Homem' : 'Indeciso'),
        data.buyer || '',
        data.groupSize || people.length,
        'R$ ' + Number(data.pricePerPerson || 0).toFixed(2).replace('.', ','),
        'R$ ' + Number(data.totalAmount || 0).toFixed(2).replace('.', ','),
        data.paymentId || '',
        data.payerEmail || '',
        data.paymentStatus || 'approved',
        ticketId,
        data.groupId || '',
        false,
        ''
      ]);
    });

    return json({ ok: true, count: tickets.length, tickets: tickets, groupId: data.groupId });
  } finally {
    lock.releaseLock();
  }
}

function handleListTickets(data) {
  const groupId = data.groupId;
  if (!groupId) return json({ ok: false, error: 'groupId_required' });

  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return json({ ok: true, tickets: [] });

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const tickets = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[COL.groupId - 1]) === String(groupId)) {
      tickets.push({
        ticketId: r[COL.ticketId - 1],
        name: r[COL.nome - 1],
        gender: r[COL.genero - 1],
        used: asBool(r[COL.usado - 1]),
        usedAt: r[COL.usadoEm - 1] ? new Date(r[COL.usadoEm - 1]).toISOString() : null,
        buyer: r[COL.comprador - 1]
      });
    }
  }

  return json({ ok: true, tickets: tickets, count: tickets.length });
}

function handleGetTicket(data) {
  const ticketId = data.ticketId;
  if (!ticketId) return json({ ok: false, error: 'ticketId_required' });

  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return json({ ok: false, error: 'ticket_not_found' });

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[COL.ticketId - 1]) === String(ticketId)) {
      return json({
        ok: true,
        ticket: {
          ticketId: r[COL.ticketId - 1],
          groupId: r[COL.groupId - 1],
          name: r[COL.nome - 1],
          gender: r[COL.genero - 1],
          buyer: r[COL.comprador - 1],
          used: asBool(r[COL.usado - 1]),
          usedAt: r[COL.usadoEm - 1] ? new Date(r[COL.usadoEm - 1]).toISOString() : null
        }
      });
    }
  }
  return json({ ok: false, error: 'ticket_not_found' });
}

function handleValidateTicket(data) {
  const ticketId = data.ticketId;
  if (!ticketId) return json({ ok: false, error: 'ticketId_required' });

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return json({ ok: false, error: 'ticket_not_found' });

    const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (String(r[COL.ticketId - 1]) === String(ticketId)) {
        const isUsed = asBool(r[COL.usado - 1]);
        const sheetRow = i + 2; // pula header

        if (isUsed) {
          return json({
            ok: false,
            error: 'already_used',
            name: r[COL.nome - 1],
            gender: r[COL.genero - 1],
            buyer: r[COL.comprador - 1],
            usedAt: r[COL.usadoEm - 1] ? new Date(r[COL.usadoEm - 1]).toISOString() : null
          });
        }

        // Marca como usado
        const now = new Date();
        sheet.getRange(sheetRow, COL.usado).setValue(true);
        sheet.getRange(sheetRow, COL.usadoEm).setValue(now);

        return json({
          ok: true,
          name: r[COL.nome - 1],
          gender: r[COL.genero - 1],
          buyer: r[COL.comprador - 1],
          validatedAt: now.toISOString()
        });
      }
    }

    return json({ ok: false, error: 'ticket_not_found' });
  } finally {
    lock.releaseLock();
  }
}

function handleAdminStats() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return json({ ok: true, total: 0, used: 0, remaining: 0, byGender: {} });

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  let total = 0, used = 0;
  const byGender = { Homem: 0, Mulher: 0, Indeciso: 0 };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r[COL.ticketId - 1]) continue; // pula linhas sem ticket
    total++;
    if (asBool(r[COL.usado - 1])) used++;
    const g = r[COL.genero - 1];
    if (byGender[g] !== undefined) byGender[g]++;
  }

  return json({
    ok: true,
    total: total,
    used: used,
    remaining: total - used,
    byGender: byGender
  });
}
