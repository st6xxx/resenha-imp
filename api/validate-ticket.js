/**
 * POST /api/validate-ticket
 * Body: { ticketId: string, password: string }
 *
 * Valida um ingresso na entrada da festa. Marca como usado e devolve nome/gênero.
 * Se já foi usado, devolve quando foi usado.
 *
 * EXIGE env vars:
 *   - SHEETS_URL
 *   - ADMIN_PASSWORD  (senha que o admin digita no painel)
 */

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
    const { ticketId, password } = body;

    if (password !== adminPwd) {
      return res.status(401).json({ ok: false, error: 'invalid_password' });
    }
    if (!ticketId) {
      return res.status(400).json({ ok: false, error: 'ticket_id_required' });
    }

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
