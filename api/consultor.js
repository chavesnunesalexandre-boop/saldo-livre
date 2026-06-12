import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `Você é um consultor financeiro pessoal experiente e empático. Analise os dados financeiros da família e forneça uma análise detalhada em português brasileiro. Seja direto, prático e encorajador. Responda APENAS em JSON válido com esta estrutura:
{
  notaSaude: número de 0 a 10,
  resumo: texto curto de 2 linhas,
  insights: array de {tipo: 'positivo'|'alerta'|'neutro', texto: string},
  categorias: array de {nome, valor, percentual, avaliacao: 'ok'|'alto'|'critico'},
  sugestoes: array de strings,
  comparacao: texto comparando com meses anteriores
}`;

const SCHEMA = {
  type: "object",
  properties: {
    notaSaude: { type: "number" },
    resumo: { type: "string" },
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["positivo", "alerta", "neutro"] },
          texto: { type: "string" },
        },
        required: ["tipo", "texto"],
        additionalProperties: false,
      },
    },
    categorias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" },
          valor: { type: "number" },
          percentual: { type: "number" },
          avaliacao: { type: "string", enum: ["ok", "alto", "critico"] },
        },
        required: ["nome", "valor", "percentual", "avaliacao"],
        additionalProperties: false,
      },
    },
    sugestoes: { type: "array", items: { type: "string" } },
    comparacao: { type: "string" },
  },
  required: ["notaSaude", "resumo", "insights", "categorias", "sugestoes", "comparacao"],
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
    const dados = req.body || {};
    const client = new Anthropic(); // le ANTHROPIC_API_KEY do ambiente
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        { role: "user", content: `Dados financeiros do mês para análise:\n${JSON.stringify(dados, null, 2)}` },
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
