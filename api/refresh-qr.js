/**
 * GET /api/refresh-qr?ticket=<ticketId>
 *
 * Gera um TOKEN ROTATIVO assinado pra exibir no QR.
 * O token expira a cada 10 segundos — o cliente precisa
 * chamar esse endpoint de novo pra pegar o próximo.
 *
 * Formato do token: <ticketId>.<window>.<sig>
 *   - ticketId: id do ingresso (12 chars)
 *   - window: Math.floor(unix_seconds / 10) — incrementa a cada 10s
 *   - sig: HMAC-SHA256(QR_SECRET, "ticketId.window").hex.slice(0, 12)
 *
 * EXIGE env var: QR_SECRET (qualquer string aleatória de 32+ chars)
 *   Se não tiver, usa ADMIN_PASSWORD como fallback (com prefixo).
 */

import crypto from 'crypto';

const WINDOW_SECONDS = 10;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ticketId = req.query?.ticket || req.body?.ticketId;
  if (!ticketId) return res.status(400).json({ ok: false, error: 'ticket_required' });

  const secret = getSecret();
  if (!secret) return res.status(500).json({ ok: false, error: 'no_secret' });

  const nowSec = Math.floor(Date.now() / 1000);
  const windowNum = Math.floor(nowSec / WINDOW_SECONDS);
  const sig = sign(`${ticketId}.${windowNum}`, secret);
  const token = `${ticketId}.${windowNum}.${sig}`;

  const windowEndSec = (windowNum + 1) * WINDOW_SECONDS;
  const secondsLeft = Math.max(0, windowEndSec - nowSec);

  return res.status(200).json({
    ok: true,
    qr: token,
    window: windowNum,
    expires_at: windowEndSec * 1000,
    seconds_left: secondsLeft
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
