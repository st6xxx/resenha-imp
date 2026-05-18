/**
 * GET /api/get-ticket?id=<ticketId>
 *
 * Retorna um único ingresso pelo ticket_id (pra página individual).
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const sheetsUrl = process.env.SHEETS_URL;
  if (!sheetsUrl) return res.status(500).json({ ok: false, error: 'sheets_url_missing' });

  const ticketId = req.query.id;
  if (!ticketId) return res.status(400).json({ ok: false, error: 'ticket_required' });

  try {
    const r = await fetch(sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'get_ticket', ticketId })
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
