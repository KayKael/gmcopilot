/** Helpers de IA — só corre no servidor. OpenAI primeiro; Lovable como fallback. */

export const MODELO_RAPIDO = "gpt-4o-mini";
export const MODELO_FORTE = "gpt-4o-mini";
const MODELO_LOVABLE_RAPIDO = "google/gemini-2.5-flash";
const MODELO_LOVABLE_FORTE = "google/gemini-2.5-flash";

export class AIError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface Mensagem {
  role: "system" | "user" | "assistant";
  content: string;
}

function mapModeloLovable(model: string): string {
  if (model === MODELO_FORTE || model.includes("pro")) return MODELO_LOVABLE_FORTE;
  return MODELO_LOVABLE_RAPIDO;
}

async function chamarOpenAI(body: Record<string, unknown>) {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new AIError("OPENAI_API_KEY em falta no servidor", 500);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detalhe = await res.text();
    console.error("OpenAI chat:", res.status, detalhe);
    const semCreditos =
      res.status === 429 ||
      res.status === 402 ||
      /credit|quota|billing/i.test(detalhe);
    if (semCreditos) throw new AIError("Créditos OpenAI esgotados", 402);
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

async function chamarLovable(body: Record<string, unknown>) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AIError("LOVABLE_API_KEY em falta", 500);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detalhe = await res.text();
    console.error("Lovable chat:", res.status, detalhe);
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

async function chamarChat(body: Record<string, unknown>, model: string) {
  if (process.env["OPENAI_API_KEY"]) {
    try {
      return await chamarOpenAI({ ...body, model });
    } catch (e) {
      if (!(e instanceof AIError) || e.status !== 402 || !process.env["LOVABLE_API_KEY"]) {
        throw e;
      }
      console.warn("OpenAI sem créditos — a usar Lovable AI para chat");
    }
  } else if (!process.env["LOVABLE_API_KEY"]) {
    throw new AIError("OPENAI_API_KEY em falta no servidor", 500);
  }
  return chamarLovable({ ...body, model: mapModeloLovable(model) });
}

/** Resposta em texto simples. */
export async function chatTexto(
  messages: Mensagem[],
  model = MODELO_RAPIDO,
): Promise<string> {
  const json = await chamarChat({ messages, temperature: 0.3 }, model);
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Resposta estruturada via tool calling. */
export async function chatEstruturado<T>(
  messages: Mensagem[],
  tool: { name: string; description: string; parameters: Record<string, unknown> },
  model = MODELO_RAPIDO,
): Promise<T | null> {
  const json = await chamarChat(
    {
      messages,
      temperature: 0,
      tools: [{ type: "function", function: tool }],
      tool_choice: { type: "function", function: { name: tool.name } },
    },
    model,
  );
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
        json.error?.type === "insufficient_quota" ||
        /credit|quota|billing/i.test(json.error?.message ?? "");
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
    throw new AIError(
      "Créditos OpenAI esgotados — adiciona créditos ou define LOVABLE_API_KEY",
      402,
    );
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
