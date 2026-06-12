import Anthropic from "@anthropic-ai/sdk";

// Esquema de saida estruturada — garante JSON valido vindo do modelo.
const SCHEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" },
          qtd: { type: "number" },
          valor: { type: "number" },
        },
        required: ["nome", "valor"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
};

const PROMPT =
  "Esta e a foto de um cupom fiscal eletronico (NFC-e) brasileiro. " +
  "Extraia a lista de itens/produtos comprados. Para cada item retorne: " +
  "nome (descricao do produto), qtd (quantidade como numero; use 1 se nao indicado) e " +
  "valor (valor TOTAL do item em reais, numero com ponto decimal). " +
  "Ignore impostos, descontos, subtotais, total geral e dados do estabelecimento. " +
  "Responda apenas com o JSON.";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Use POST" }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY nao configurada no servidor (defina nas Environment Variables do Vercel)." });
    return;
  }

  try {
    const { image, mediaType } = req.body || {};
    if (!image) { res.status(400).json({ error: "Imagem nao enviada" }); return; }

    const client = new Anthropic(); // le ANTHROPIC_API_KEY do ambiente
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const block = (msg.content || []).find((b) => b.type === "text");
    let itens = [];
    try { itens = JSON.parse((block && block.text) || "{}").itens || []; } catch (e) { itens = []; }
    res.status(200).json({ itens });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
