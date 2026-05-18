/**
 * ============================================
 *  RESENHA IMP — Webhook do Mercado Pago
 * ============================================
 *
 * O MP chama essa URL quando o status de um pagamento muda.
 * Aqui a gente:
 *   1. Pega o ID do pagamento que veio na notificação
 *   2. Consulta a API do MP pra confirmar status === 'approved'
 *   3. Se pagou de verdade → grava na planilha do Google Sheets
 *
 * EXIGE env vars:
 *   - MP_ACCESS_TOKEN  (mesmo do create-payment)
 *   - SHEETS_URL       (URL do Google Apps Script publicado como Web App)
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // GET = só pra teste manual, pra ver se o endpoint tá vivo
  if (req.method === 'GET') {
    return res.status(200).send('RESENHA IMP webhook · ok');
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  const sheetsUrl = process.env.SHEETS_URL;

  if (!accessToken) {
    console.error('[webhook] MP_ACCESS_TOKEN não configurado');
    return res.status(200).json({ ok: false, reason: 'no_access_token' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const query = req.query || {};

    // MP pode mandar em vários formatos diferentes — tentamos extrair o payment_id:
    let paymentId = null;
    if (body.type === 'payment' && body.data && body.data.id) {
      paymentId = body.data.id;
    } else if (body.topic === 'payment' && body.resource) {
      paymentId = String(body.resource).split('/').pop();
    } else if (query.topic === 'payment' && query.id) {
      paymentId = query.id;
    } else if (body.id && body.type === 'payment') {
      paymentId = body.id;
    }

    if (!paymentId) {
      console.log('[webhook] notificação ignorada (sem payment_id):', body);
      // Sempre responde 200 pro MP não ficar reenviando
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Consulta o pagamento na API do MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!mpRes.ok) {
      const errText = await mpRes.text();
      console.error('[webhook] erro ao buscar pagamento:', errText);
      return res.status(200).json({ ok: false, paymentId, error: 'fetch_failed' });
    }

    const payment = await mpRes.json();
    console.log(`[webhook] payment ${paymentId} · status=${payment.status}`);

    // Só processa se o pagamento foi APROVADO
    if (payment.status !== 'approved') {
      return res.status(200).json({
        ok: true,
        paymentId,
        status: payment.status,
        action: 'skipped_not_approved'
      });
    }

    // Extrai dados da metadata que foi salva no create-payment
    const metadata = payment.metadata || {};
    const peopleEncoded = metadata.people || '';
    const people = peopleEncoded
      .split(';')
      .filter(Boolean)
      .map((s) => {
        const [name, gender] = s.split('|');
        return { name: name || '', gender: gender || '?', manual: false };
      });

    const groupSize = metadata.qty || people.length || 1;
    const pricePerPerson = Number(metadata.price_per_person || payment.transaction_amount);
    const totalAmount = Number(metadata.total_amount || payment.transaction_amount);
    const buyer = metadata.buyer || payment.payer?.first_name || '';
    const groupId = metadata.group_id || '';

    // ⭐ Resolve o email do pagador ANTES de qualquer coisa.
    //    MP mascara o email em alguns casos (LGPD/guest checkout) — vem como "XXXX@XXXX".
    //    A gente prefere o que o cliente digitou no formulário (vem na metadata).
    const looksMasked = (e) => !e || /^[X*]+$/i.test(String(e).replace(/[@.]/g, ''));
    const metaEmail = metadata.buyer_email || metadata.email;
    const mpEmail = payment.payer?.email;
    const resolvedEmail = !looksMasked(metaEmail) ? metaEmail
                        : (!looksMasked(mpEmail) ? mpEmail : null);

    console.log(`[webhook] email · meta="${metaEmail}" mp="${mpEmail}" usado="${resolvedEmail}"`);

    // Cria ingressos na planilha + recebe os ticket_ids gerados
    let createdTickets = [];
    if (sheetsUrl && !sheetsUrl.includes('SEU_ID_AQUI')) {
      try {
        const sheetPayload = {
          action: 'create_tickets',
          people: people.length ? people : [{ name: buyer || '(sem nome)', gender: '?', manual: false }],
          buyer,
          groupSize,
          totalAmount,
          pricePerPerson,
          paymentStatus: payment.status,
          paymentId: String(paymentId),
          payerEmail: resolvedEmail || '(email mascarado pelo MP)',
          paidAt: payment.date_approved || new Date().toISOString(),
          groupId
        };

        const sheetRes = await fetch(sheetsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(sheetPayload)
        });
        const sheetText = await sheetRes.text();
        try {
          const sheetData = JSON.parse(sheetText);
          createdTickets = sheetData.tickets || [];
          console.log(`[webhook] ingressos criados · ${createdTickets.length} pessoa(s) · group=${groupId}`);
        } catch {
          console.warn('[webhook] Sheets devolveu resposta inválida:', sheetText.slice(0, 200));
        }
      } catch (e) {
        console.error('[webhook] falhou ao criar ingressos:', e);
      }
    } else {
      console.warn('[webhook] SHEETS_URL não configurada — pulando gravação');
    }

    // Envia email com o link dos ingressos (usa o email já resolvido lá em cima)
    if (!resolvedEmail) {
      console.warn('[webhook] sem email válido — pulando envio do email');
    }
    if (resolvedEmail && createdTickets.length > 0) {
      const baseUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
      const origin = baseUrl || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
      await sendTicketEmail({
        to: resolvedEmail,
        buyer: buyer || 'pessoa boa',
        tickets: createdTickets,
        groupId,
        totalAmount,
        baseUrl: origin
      }).catch((e) => console.error('[email] falhou:', e));
    }

    return res.status(200).json({
      ok: true,
      paymentId,
      status: payment.status,
      groupSize,
      action: 'written_to_sheets'
    });
  } catch (err) {
    console.error('[webhook] erro inesperado:', err);
    // Sempre devolve 200 pro MP — senão fica retentando
    return res.status(200).json({ ok: false, error: err.message });
  }
}

// ============================================
//  Envia email com os links dos ingressos
// ============================================
async function sendTicketEmail({ to, buyer, tickets, groupId, totalAmount, baseUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY não configurada, pulando envio');
    return;
  }

  const fromAddress = process.env.RESEND_FROM || 'RESENHA IMP <onboarding@resend.dev>';
  const groupUrl = `${baseUrl}/ingresso/${groupId}`;
  const totalFmt = 'R$ ' + Number(totalAmount).toFixed(2).replace('.', ',');

  // monta os blocos individuais por pessoa
  const ticketRows = tickets.map((t) => {
    const ticketUrl = `${baseUrl}/ingresso/${groupId}/${t.ticketId}`;
    const genderLabel = t.gender === 'F' ? 'Mulher' : (t.gender === 'M' ? 'Homem' : 'Indeciso');
    return `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
        <tr><td style="padding:14px 16px;border-radius:14px;background:rgba(255,248,240,0.05);border:1px solid rgba(255,248,240,0.12);">
          <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;font-size:16px;color:#fff8f0;margin-bottom:2px;">${escapeHtml(t.name) || '(sem nome)'}</div>
          <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#aaa;margin-bottom:10px;letter-spacing:0.04em;">${genderLabel} · #${escapeHtml(t.ticketId)}</div>
          <a href="${ticketUrl}" style="display:inline-block;padding:8px 16px;border-radius:100px;background:rgba(0,229,255,0.18);color:#00e5ff;text-decoration:none;font-size:13px;font-weight:700;font-family:'Helvetica Neue',Arial,sans-serif;border:1px solid rgba(0,229,255,0.5);">ver QR code →</a>
        </td></tr>
      </table>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Seus ingressos · RESENHA IMP</title></head>
<body style="margin:0;padding:0;background:#0d0820;font-family:'Helvetica Neue',Arial,sans-serif;color:#fff8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0820;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:linear-gradient(160deg,#1a0d3a,#0d0820);border-radius:24px;overflow:hidden;border:2px solid rgba(255,217,61,0.35);">
        <tr><td style="padding:40px 32px;">

          <div style="text-align:center;font-size:36px;font-weight:800;letter-spacing:-0.02em;margin-bottom:8px;line-height:1;">
            <span style="color:#fff8f0;">RESENHA</span><span style="color:#ffd93d;font-style:italic;"> IMP</span>
          </div>
          <div style="text-align:center;font-size:12px;color:rgba(255,248,240,0.6);margin-bottom:28px;letter-spacing:0.18em;text-transform:uppercase;">05.06.2026 · Jardim Marapendi</div>

          <h1 style="font-size:28px;font-weight:800;margin:0 0 8px;text-align:center;color:#c5ff3d;letter-spacing:-0.01em;">🎉 Pagamento aprovado!</h1>
          <p style="text-align:center;color:rgba(255,248,240,0.75);margin:0 0 28px;font-size:15px;">
            Valeu, <strong style="color:#fff8f0;">${escapeHtml(buyer)}</strong>!<br>
            <strong style="color:#fff8f0;">${tickets.length}</strong> ingresso${tickets.length !== 1 ? 's' : ''} · <strong style="color:#ffd93d;">${totalFmt}</strong> · tudo certo ✓
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding-bottom:24px;">
              <a href="${groupUrl}" style="display:inline-block;padding:16px 32px;border-radius:100px;background:linear-gradient(135deg,#ff3ea5,#ffd93d);color:#0d0820;text-decoration:none;font-weight:800;font-size:16px;letter-spacing:0.02em;">ver todos os ingressos →</a>
            </td></tr>
          </table>

          <div style="border-top:1px dashed rgba(255,248,240,0.2);padding-top:22px;margin-top:6px;">
            <p style="font-size:11px;color:rgba(255,248,240,0.6);margin:0 0 14px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700;">links individuais por pessoa</p>
            ${ticketRows}
          </div>

          <div style="margin-top:24px;padding:16px 18px;border-radius:14px;background:rgba(255,217,61,0.1);border:1px dashed rgba(255,217,61,0.45);font-size:13px;color:rgba(255,248,240,0.85);line-height:1.5;">
            💾 <strong style="color:#ffd93d;">Salve esse email!</strong> Os links são vitalícios e só você tem eles. Cada pessoa pode usar o link individual dela pra mostrar o QR na entrada da festa, ou você pode mostrar todos no link do grupo.
          </div>

          <p style="text-align:center;color:rgba(255,248,240,0.5);font-size:11px;margin:28px 0 0;letter-spacing:0.08em;">
            te vejo no Jardim Marapendi ✦ 05 de junho
          </p>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  // texto simples como fallback pra clientes que não renderizam HTML
  const text = `RESENHA IMP — Pagamento aprovado!\n\nValeu, ${buyer}!\n${tickets.length} ingresso(s) · ${totalFmt}\n\nVer todos os ingressos:\n${groupUrl}\n\nLinks individuais por pessoa:\n${tickets.map((t) => `• ${t.name}: ${baseUrl}/ingresso/${groupId}/${t.ticketId}`).join('\n')}\n\nSalve esse email! Os links são vitalícios.\n\n05 de junho · Jardim Marapendi`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [to],
      subject: '🎟️ Seus ingressos da RESENHA IMP',
      html,
      text
    })
  });

  if (!r.ok) {
    const err = await r.text();
    console.error('[email] resend retornou erro:', r.status, err);
    throw new Error('email_failed');
  }
  console.log(`[email] enviado pra ${to} · ${tickets.length} ingresso(s)`);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
