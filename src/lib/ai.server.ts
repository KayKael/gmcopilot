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

interface RespostaEmbeddings {
  data?: { embedding: number[]; index?: number }[];
  error?: { code?: string; message?: string; type?: string };
}

async function pedirEmbeddings(
  endpoint: string,
  headers: Record<string, string>,
  model: string,
  textos: string[],
): Promise<{ resposta: Response; json: RespostaEmbeddings }> {
  const resposta = await fetch(endpoint, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: textos, dimensions: 1536 }),
  });
  const json = (await resposta.json().catch(() => ({}))) as RespostaEmbeddings;
  return { resposta, json };
}

function extrairVetores(json: RespostaEmbeddings, quantidade: number): number[][] {
  const vetores = [...(json.data ?? [])]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((item) => item.embedding);
  if (vetores.length !== quantidade) throw new AIError("Resposta de embeddings incompleta", 502);
  return vetores;
}

/** Embeddings OpenAI, com fallback Lovable AI, sempre com 1536 dimensões. */
export async function embed(textos: string[]): Promise<number[][]> {
  const openAIKey = process.env["OPENAI_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!openAIKey && !lovableKey) throw new AIError("Serviço de embeddings não configurado", 500);

  if (openAIKey) {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const { resposta, json } = await pedirEmbeddings(
        "https://api.openai.com/v1/embeddings",
        { Authorization: `Bearer ${openAIKey}` },
        "text-embedding-3-small",
        textos,
      );
      if (resposta.ok) return extrairVetores(json, textos.length);

      const semCreditos =
        json.error?.code === "credit_balance_exhausted" ||
        json.error?.type === "insufficient_quota";
      console.error("Embeddings OpenAI:", resposta.status, json.error?.code ?? json.error?.type);
      if (semCreditos) break;
      if (resposta.status === 429 || resposta.status >= 500) {
        if (tentativa === 4 && !lovableKey) {
          throw new AIError("Serviço de embeddings temporariamente indisponível", resposta.status);
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 1500 * 2 ** tentativa + Math.random() * 500),
        );
        continue;
      }
      if (!lovableKey) {
        throw new AIError(json.error?.message ?? "Falha a gerar embeddings", resposta.status);
      }
      break;
    }
  }

  if (!lovableKey) {
    throw new AIError("A conta OpenAI está sem créditos", 402);
  }

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { resposta, json } = await pedirEmbeddings(
      "https://ai.gateway.lovable.dev/v1/embeddings",
      { Authorization: `Bearer ${lovableKey}` },
      "openai/text-embedding-3-small",
      textos,
    );
    if (resposta.ok) return extrairVetores(json, textos.length);

    console.error("Embeddings Lovable AI:", resposta.status, json.error?.code ?? json.error?.type);
    if (resposta.status === 429 || resposta.status >= 500) {
      if (tentativa === 4) {
        throw new AIError("Serviço de embeddings temporariamente indisponível", resposta.status);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 1500 * 2 ** tentativa + Math.random() * 500),
      );
      continue;
    }
    if (resposta.status === 402) throw new AIError("Créditos de IA esgotados", 402);
    throw new AIError(json.error?.message ?? "Falha a gerar embeddings", resposta.status);
  }

  throw new AIError("Falha a gerar embeddings", 500);
}

