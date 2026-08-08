/** Helpers de IA — só corre no servidor. */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const MODELO_RAPIDO = "google/gemini-3.6-flash";
export const MODELO_FORTE = "google/gemini-3-pro-preview";

export class AIError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface Mensagem {
  role: "system" | "user";
  content: string;
}

async function chamarGateway(body: Record<string, unknown>) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AIError("LOVABLE_API_KEY em falta", 500);
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detalhe = await res.text();
    console.error("AI gateway:", res.status, detalhe);
    if (res.status === 429) throw new AIError("Limite de pedidos atingido", 429);
    if (res.status === 402) throw new AIError("Créditos de IA esgotados", 402);
    throw new AIError("Falha no serviço de IA", res.status);
  }
  return (await res.json()) as {
    choices?: {
      message?: {
        content?: string;
        tool_calls?: { function?: { arguments?: string } }[];
      };
    }[];
  };
}

/** Resposta em texto simples. */
export async function chatTexto(
  messages: Mensagem[],
  model = MODELO_RAPIDO,
): Promise<string> {
  const json = await chamarGateway({ model, messages });
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Resposta estruturada via tool calling. */
export async function chatEstruturado<T>(
  messages: Mensagem[],
  tool: { name: string; description: string; parameters: Record<string, unknown> },
  model = MODELO_RAPIDO,
): Promise<T | null> {
  const json = await chamarGateway({
    model,
    messages,
    tools: [{ type: "function", function: tool }],
    tool_choice: { type: "function", function: { name: tool.name } },
  });
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try {
    return JSON.parse(args) as T;
  } catch {
    return null;
  }
}

/** Embeddings via OpenAI (1536 dimensões, igual à coluna doc_chunks.embedding). */
export async function embed(textos: string[]): Promise<number[][]> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new AIError("OPENAI_API_KEY em falta", 500);
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: textos,
      dimensions: 1536,
    }),
  });
  if (!res.ok) {
    const detalhe = await res.text();
    console.error("Embeddings:", res.status, detalhe);
    if (res.status === 429) throw new AIError("Limite de pedidos atingido", 429);
    throw new AIError(`Falha a gerar embeddings (${res.status})`, res.status);
  }
  const json = (await res.json()) as { data?: { embedding: number[] }[] };
  return (json.data ?? []).map((d) => d.embedding);
}

