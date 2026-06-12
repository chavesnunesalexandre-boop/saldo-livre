import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `Você é um extrator de dados financeiros. Analise a imagem de um extrato bancário ou fatura de cartão de crédito brasileiro e extraia todas as transações visíveis. Responda APENAS em JSON válido:
{
  tipo: 'cartao' ou 'conta',
  banco: nome do banco detectado,
  periodo: texto do período visível,
  itens: [{
    data: 'DD/MM' ou 'DD mmm',
    desc: descrição da transação,
    valor: número positivo,
    tipo: 'entrada' ou 'saida' (para conta) ou 'compra' ou 'estorno' (para cartão),
    parcela: 'X/Y' ou null,
    titular: nome do titular se visível ou null
  }]
}
Ignore totais, saldos e cabeçalhos. Extraia apenas transações individuais.`;

const SCHEMA = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: ["cartao", "conta"] },
    banco: { type: "string" },
    periodo: { type: "string" },
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          data: { type: "string" },
          desc: { type: "string" },
          valor: { type: "number" },
          tipo: { type: "string", enum: ["entrada", "saida", "compra", "estorno"] },
          parcela: { anyOf: [{ type: "string" }, { type: "null" }] },
          titular: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["data", "desc", "valor", "tipo", "parcela", "titular"],
        additionalProperties: false,
      },
    },
  },
  required: ["tipo", "banco", "periodo", "itens"],
  additionalProperties: false,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Use POST" }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY nao configurada no servidor (Vercel)." });
    return;
  }

  try {
    const { imagemBase64, mediaType, contexto } = req.body || {};
    if (!imagemBase64) { res.status(400).json({ error: "Imagem nao enviada" }); return; }

    const ctx = contexto === "cartao"
      ? "A imagem é uma FATURA DE CARTÃO DE CRÉDITO. Use tipo 'compra' ou 'estorno' em cada item."
      : "A imagem é um EXTRATO DE CONTA CORRENTE. Use tipo 'entrada' ou 'saida' em cada item.";

    const client = new Anthropic(); // le ANTHROPIC_API_KEY do ambiente
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imagemBase64 } },
            { type: "text", text: ctx },
          ],
        },
      ],
    });

    const block = (msg.content || []).find((b) => b.type === "text");
    let out = null;
    try { out = JSON.parse((block && block.text) || "null"); } catch (e) { out = null; }
    if (!out) { res.status(502).json({ error: "Resposta inválida da IA" }); return; }
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
