// Cloudflare Workers — Gemini address suggestion proxy.
// Configure GEMINI_API_KEY as a SECRET in Cloudflare, never in GitHub Pages.
// Replace the ALLOWED_ORIGIN value with the exact URL of your published GitHub Pages site.
const ALLOWED_ORIGIN = 'https://carloseduardobraz90-ship-it.github.io';
const MODEL = 'gemini-2.5-flash-lite';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = origin === ALLOWED_ORIGIN;
    const headers = {
      'Access-Control-Allow-Origin': allowed ? ALLOWED_ORIGIN : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (!allowed) return reply({ error: 'Origem não autorizada.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405);
    if (!env.GEMINI_API_KEY) return reply({ error: 'Chave Gemini não configurada no Worker.' }, 503);
    if (Number(request.headers.get('Content-Length') || 0) > 4096) return reply({ error: 'Entrada muito grande.' }, 413);
    let input;
    try { input = await request.json(); } catch { return reply({ error: 'JSON inválido.' }, 400); }
    const clean = v => typeof v === 'string' ? v.trim().slice(0, 240) : '';
    const supplierName = clean(input.supplierName);
    const address = clean(input.address);
    const city = clean(input.city);
    if (address.length < 5) return reply({ error: 'Informe um endereço válido.' }, 400);
    // Shared endpoint: browser CORS is not authentication. Apply Cloudflare rate limits
    // and bot protection; public use consumes the account's free Gemini quota.
    const prompt = `Você auxilia a padronização de endereços brasileiros para busca em geocodificadores. Não invente números, CEPs, cidades ou coordenadas. Não afirme que o endereço existe sem prova. Sugira no máximo 3 variantes de texto de pesquisa baseadas apenas nos dados fornecidos. Se não houver informação suficiente, retorne lista vazia. Responda APENAS JSON no formato {"suggestions":["endereço 1"]}.\nNome: ${supplierName}\nEndereço: ${address}\nCidade: ${city}`;
    try {
      const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 500 }
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (!upstream.ok) {
        return reply({ error: upstream.status === 429 ? 'Cota gratuita da IA esgotada. Tente mais tarde.' : 'Serviço de IA indisponível.' }, 503);
      }
      const result = await upstream.json();
      const raw = result.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
      const parsed = JSON.parse(raw);
      const suggestions = Array.isArray(parsed.suggestions)
        ? [...new Set(parsed.suggestions.filter(x => typeof x === 'string' && x.length <= 240).map(x => x.trim()).filter(Boolean))].slice(0, 3)
        : [];
      return reply({ suggestions });
    } catch { return reply({ error: 'Não foi possível consultar a IA agora.' }, 503); }
  }
};
