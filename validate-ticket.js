/**
 * POST /api/validate-ticket
 * Body: { ticketId: string, password: string }
 *
 * O `ticketId` pode vir em dois formatos:
 *   1. Token rotativo (NORMAL):  "<ticketId>.<window>.<sig>"  ← QR atual rotaciona
 *   2. ID puro (ADMIN MANUAL):   "<ticketId>"                ← caso admin digite
 *
 * Token rotativo é gerado pelo /api/refresh-qr a cada 10s.
 * Aqui validamos a assinatura HMAC + se a janela de tempo ainda é válida.
 *
 * EXIGE env vars:
 *   - SHEETS_URL
 *   - ADMIN_PASSWORD
 *   - QR_SECRET (opcional, fallback usa ADMIN_PASSWORD)
 */

import crypto from 'crypto';

// Token vale 10s desde a emissão + 2s de margem de rede.
// Tudo acima de 12s é REJEITADO como expirado.
const MAX_AGE_MS = 12000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const sheetsUrl = process.env.SHEETS_URL;
  const adminPwd = process.env.ADMIN_PASSWORD;

  if (!sheetsUrl || !adminPwd) {
    return res.status(500).json({ ok: false, error: 'server_not_configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { ticketId: rawTicket, password } = body;

    if (password !== adminPwd) {
      return res.status(401).json({ ok: false, error: 'invalid_password' });
    }
    if (!rawTicket) {
      return res.status(400).json({ ok: false, error: 'ticket_id_required' });
    }

    // parse e valida o token (rotativo ou direto)
    const parsed = parseAndVerifyToken(rawTicket);
    if (parsed.error) {
      return res.status(200).json({ ok: false, error: parsed.error });
    }

    const ticketId = parsed.ticketId;

    // chama o Apps Script só com o ID limpo, marca como usado
    const r = await fetch(sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'validate_ticket', ticketId })
    });
    const text = await r.text();
    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch {
      return res.status(502).json({ ok: false, error: 'invalid_sheets_response', detail: text.slice(0, 200) });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// =====================================================
//  Parser do token rotativo
// =====================================================
function parseAndVerifyToken(raw) {
  const txt = String(raw).trim();
  const parts = txt.split('.');

  // Formato 1: ID puro (sem ponto) — modo legado / fallback admin
  // Aceita só se for um ID válido (12 chars alfanuméricos do alfabeto que a gente usa)
  if (parts.length === 1) {
    const id = parts[0];
    if (/^[A-Z0-9]{8,16}$/i.test(id)) {
      return { ticketId: id, mode: 'direct' };
    }
    return { error: 'invalid_format' };
  }

  // Formato 2: token rotativo deslizante "ticketId.issuedAtMs.sig"
  if (parts.length !== 3) {
    return { error: 'invalid_format' };
  }
  const [ticketId, issuedStr, sig] = parts;
  const issuedAt = Number(issuedStr);
  if (!ticketId || !Number.isFinite(issuedAt) || !sig) {
    return { error: 'invalid_format' };
  }

  // verifica assinatura HMAC
  const secret = getSecret();
  if (!secret) return { error: 'server_misconfigured' };

  const expected = sign(`${ticketId}.${issuedAt}`, secret);
  if (expected !== sig) {
    return { error: 'invalid_signature' };
  }

  // verifica idade do token
  const now = Date.now();
  const age = now - issuedAt;
  if (age < -5000) {
    // emitido mais de 5s no futuro — relógio do servidor MP/cliente fora de sync
    return { error: 'qr_invalid_time' };
  }
  if (age > MAX_AGE_MS) {
    // token expirou (mais de 12s desde a emissão)
    return { error: 'qr_expired' };
  }

  return { ticketId, mode: 'rotating', issuedAt };
}

function getSecret() {
  return process.env.QR_SECRET || (process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD + '_qr_v1' : null);
}

function sign(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
    .slice(0, 12);
}
