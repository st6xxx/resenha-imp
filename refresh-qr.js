/**
 * GET /api/refresh-qr?ticket=<ticketId>
 *
 * Gera um TOKEN ROTATIVO assinado pra exibir no QR.
 * Cada token tem 10 segundos de validade a partir do momento que foi emitido
 * (janela DESLIZANTE, não alinhada com o relógio).
 *
 * Formato: <ticketId>.<issuedAtMs>.<sig>
 *   - issuedAtMs = Date.now() (milissegundos desde epoch)
 *   - sig = HMAC-SHA256(QR_SECRET, "ticketId.issuedAtMs").hex.slice(0, 12)
 *
 * EXIGE: QR_SECRET (ou fallback derivado de ADMIN_PASSWORD)
 */

import crypto from 'crypto';

const VALID_MS = 10000; // token vale por 10 segundos exatos

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ticketId = req.query?.ticket || req.body?.ticketId;
  if (!ticketId) return res.status(400).json({ ok: false, error: 'ticket_required' });

  const secret = getSecret();
  if (!secret) return res.status(500).json({ ok: false, error: 'no_secret' });

  const issuedAt = Date.now();
  const expiresAt = issuedAt + VALID_MS;
  const sig = sign(`${ticketId}.${issuedAt}`, secret);
  const token = `${ticketId}.${issuedAt}.${sig}`;

  return res.status(200).json({
    ok: true,
    qr: token,
    issued_at: issuedAt,
    expires_at: expiresAt,
    valid_ms: VALID_MS
  });
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
