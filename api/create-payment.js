/**
 * ============================================
 *  RESENHA IMP — Criação de pagamento
 * ============================================
 *
 * Cria uma "preferência" no Mercado Pago e devolve a URL de checkout.
 * Configura também o WEBHOOK pra MP avisar quando o pagamento for confirmado.
 *
 * Gera também um `group_id` aleatório que vira a URL vitalícia do ingresso
 * (ex: /ingresso/<group_id>).
 *
 * EXIGE env var: MP_ACCESS_TOKEN
 */

import crypto from 'crypto';

function genGroupId() {
  return crypto.randomBytes(12).toString('hex'); // 24 chars hex, ~96 bits de entropia
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({
      error: 'MP_ACCESS_TOKEN não configurada nas env vars da Vercel'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { qty, pricePerPerson, people = [], buyer = '', email = '' } = body;

    if (!qty || !pricePerPerson) {
      return res.status(400).json({ error: 'qty e pricePerPerson são obrigatórios' });
    }

    // URL base — usada nos back_urls e na notification_url do webhook
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${proto}://${host}`;

    // Codifica os nomes de forma compacta pra caber na metadata do MP
    // (formato: "Camila|F;Pedro|M;João|M")
    const peopleEncoded = people
      .slice(0, 10)
      .map((p) => `${String(p.name || '').slice(0, 25).replace(/[|;]/g, '')}|${p.gender || '?'}`)
      .join(';');

    const total = Number(qty) * Number(pricePerPerson);
    const groupId = genGroupId();

    const preference = {
      items: [
        {
          title: 'Ingresso RESENHA IMP',
          description: 'Festa Resenha IMP · 05 de junho · Jardim Marapendi',
          quantity: Number(qty),
          unit_price: Number(pricePerPerson),
          currency_id: 'BRL'
        }
      ],
      back_urls: {
        success: `${baseUrl}/?status=success`,
        pending: `${baseUrl}/?status=pending`,
        failure: `${baseUrl}/?status=failure`
      },
      auto_return: 'approved',
      external_reference: `resenha-imp-${Date.now()}`,
      statement_descriptor: 'RESENHA IMP',

      // ⭐ WEBHOOK: MP vai chamar essa URL quando o pagamento for processado
      notification_url: `${baseUrl}/api/webhook`,

      // metadata fica disponível no webhook depois — usamos pra saber quem comprou
      metadata: {
        buyer: String(buyer).slice(0, 60),
        buyer_email: String(email).slice(0, 120),
        qty: Number(qty),
        price_per_person: Number(pricePerPerson),
        total_amount: total,
        people: peopleEncoded,
        group_id: groupId
      },

      // ⭐ pré-preenche o email no checkout do MP e ajuda a evitar mascaramento
      payer: email ? { email: String(email).slice(0, 120) } : undefined,

      payment_methods: {
        installments: 6  // até 6x sem juros
      }
    };

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preference)
    });

    if (!mpResponse.ok) {
      const errText = await mpResponse.text();
      console.error('[MP] erro na criação da preferência:', errText);
      return res.status(502).json({
        error: 'Erro ao criar pagamento no Mercado Pago',
        detail: errText
      });
    }

    const data = await mpResponse.json();

    // ⚠️ Token de teste cria preferência no sandbox — precisa redirecionar
    //   pro sandbox_init_point, senão o MP responde "ID does not exist".
    //   Token de produção (APP_USR-) usa init_point normalmente.
    const isTestToken = accessToken.startsWith('TEST-');
    const checkoutUrl = isTestToken
      ? (data.sandbox_init_point || data.init_point)
      : data.init_point;

    return res.status(200).json({
      init_point: checkoutUrl,
      sandbox_init_point: data.sandbox_init_point,
      mode: isTestToken ? 'test' : 'production',
      preference_id: data.id,
      group_id: groupId,
      ticket_url: `${baseUrl}/ingresso/${groupId}`
    });
  } catch (err) {
    console.error('[api] erro:', err);
    return res.status(500).json({ error: err.message || 'Erro inesperado' });
  }
}
