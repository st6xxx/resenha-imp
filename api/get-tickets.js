/**
 * GET /api/get-tickets?group=<groupId>
 *
 * Consulta o Apps Script pra trazer os ingressos de um grupo.
 * A página /ingresso/<id> chama esse endpoint pra renderizar os QR codes.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const sheetsUrl = process.env.SHEETS_URL;
  if (!sheetsUrl) {
    return res.status(500).json({ ok: false, error: 'sheets_url_missing' });
  }

  const groupId = req.query.group;
  if (!groupId) {
    return res.status(400).json({ ok: false, error: 'group_required' });
  }

  try {
    const r = await fetch(sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'list_tickets', groupId })
    });
    const text = await r.text();
    // Apps Script às vezes responde com HTML em erro; tenta parsear JSON
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
