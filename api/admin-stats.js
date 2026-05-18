/**
 * POST /api/admin-stats
 * Body: { password: string }
 *
 * Retorna estatísticas dos ingressos (total, usados, restantes, por gênero).
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const sheetsUrl = process.env.SHEETS_URL;
  const adminPwd = process.env.ADMIN_PASSWORD;
  if (!sheetsUrl || !adminPwd) {
    return res.status(500).json({ ok: false, error: 'server_not_configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (body.password !== adminPwd) {
      return res.status(401).json({ ok: false, error: 'invalid_password' });
    }

    const r = await fetch(sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'admin_stats' })
    });
    const text = await r.text();
    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(502).json({ ok: false, error: 'invalid_sheets_response' });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
