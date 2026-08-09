/** Helpers de IA — só corre no servidor. Lovable primeiro; OpenAI como fallback. */

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

export type MensagemChat = Mensagem;

const MODELO_GEMINI = "gemini-2.5-flash";

function temLovable() {
  return Boolean(process.env["LOVABLE_API_KEY"]?.trim());
}

function temOpenAI() {
  return Boolean(process.env["OPENAI_API_KEY"]?.trim());
}

function mapModeloLovable(model: string): string {
  if (model === MODELO_FORTE || model.includes("pro")) return MODELO_LOVABLE_FORTE;
  return MODELO_LOVABLE_RAPIDO;
}

async function chamarOpenAI(body: Record<string, unknown>) {
  const key = process.env["OPENAI_API_KEY"]?.trim();
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
  const key = process.env["LOVABLE_API_KEY"]?.trim();
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
  if (temLovable()) {
    try {
      return await chamarLovable({ ...body, model: mapModeloLovable(model) });
    } catch (e) {
      if (!temOpenAI()) throw e;
      console.warn("Lovable chat falhou — a tentar OpenAI");
      return chamarOpenAI({ ...body, model });
    }
  }
  if (temOpenAI()) {
    return chamarOpenAI({ ...body, model });
  }
  throw new AIError(
    "Nenhuma API key de IA — define LOVABLE_API_KEY (preferido) ou OPENAI_API_KEY no .env",
    500,
  );
}

/** Resposta em texto simples. */
export async function chatTexto(
  messages: Mensagem[],
  model = MODELO_RAPIDO,
): Promise<string> {
  const json = await chamarChat({ messages, temperature: 0.3 }, model);
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

/**
 * Chat via Gemini (Google AI). Usado no painel Campanha.
 * System → systemInstruction; user/assistant → contents (user/model).
 */
export async function chatGemini(
  messages: Mensagem[],
  model = MODELO_GEMINI,
): Promise<string> {
  const key = process.env["GEMINI_API_KEY"]?.trim();
  if (!key) {
    throw new AIError(
      "GEMINI_API_KEY em falta — define no .env e reinicia o servidor",
      500,
    );
  }

  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content.trim())
    .filter(Boolean);
  const turnos = messages.filter((m) => m.role === "user" || m.role === "assistant");

  // Gemini exige alternância user/model; funde turnos consecutivos do mesmo papel
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of turnos) {
    const role = m.role === "assistant" ? "model" : "user";
    const text = m.content.trim();
    if (!text) continue;
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0] = { text: `${last.parts[0]?.text ?? ""}\n\n${text}` };
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  if (!contents.length) throw new AIError("Mensagens vazias para Gemini", 400);
  // Primeira mensagem tem de ser user
  if (contents[0]?.role !== "user") {
    contents.unshift({ role: "user", parts: [{ text: "(continua)" }] });
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: 0.4 },
  };
  if (systemParts.length) {
    body["systemInstruction"] = { parts: [{ text: systemParts.join("\n\n") }] };
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detalhe = await res.text();
    console.error("Gemini chat:", res.status, detalhe.slice(0, 800));
    if (res.status === 429) throw new AIError("Limite de pedidos Gemini atingido", 429);
    if (res.status === 404) {
      throw new AIError(
        `Modelo Gemini indisponível (${model}) — actualiza MODELO_GEMINI`,
        404,
      );
    }
    if (res.status === 400 || res.status === 403) {
      throw new AIError(
        `Pedido Gemini rejeitado (${res.status}) — verifica a GEMINI_API_KEY`,
        res.status,
      );
    }
    throw new AIError(`Falha no Gemini (${res.status})`, res.status);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const texto = json.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  return texto ?? "";
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

async function embedViaLovable(textos: string[], lovableKey: string): Promise<number[][]> {
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

async function embedViaOpenAI(textos: string[], openAIKey: string): Promise<number[][]> {
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
    if (semCreditos) throw new AIError("Créditos OpenAI esgotados", 402);
    if (resposta.status === 429 || resposta.status >= 500) {
      if (tentativa === 4) {
        throw new AIError("Serviço de embeddings temporariamente indisponível", resposta.status);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 1500 * 2 ** tentativa + Math.random() * 500),
      );
      continue;
    }
    throw new AIError(json.error?.message ?? "Falha a gerar embeddings", resposta.status);
  }
  throw new AIError("Falha a gerar embeddings", 500);
}

/** Embeddings Gemini com 1536 dims (compatível com doc_chunks). */
async function embedViaGemini(textos: string[], geminiKey: string): Promise<number[][]> {
  const model = "gemini-embedding-001";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify({
        requests: textos.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          outputDimensionality: 1536,
        })),
      }),
    });

    if (res.ok) {
      const json = (await res.json()) as {
        embeddings?: { values?: number[] }[];
      };
      const vetores = (json.embeddings ?? []).map((e) => e.values ?? []);
      if (vetores.length !== textos.length || vetores.some((v) => v.length !== 1536)) {
        throw new AIError("Resposta de embeddings Gemini incompleta", 502);
      }
      return vetores;
    }

    const detalhe = await res.text();
    console.error("Embeddings Gemini:", res.status, detalhe.slice(0, 400));
    if (res.status === 429 || res.status >= 500) {
      if (tentativa === 4) {
        throw new AIError("Serviço de embeddings Gemini indisponível", res.status);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 1500 * 2 ** tentativa + Math.random() * 500),
      );
      continue;
    }
    throw new AIError("Falha a gerar embeddings Gemini", res.status);
  }
  throw new AIError("Falha a gerar embeddings Gemini", 500);
}

/** Embeddings: Gemini → Lovable → OpenAI. Sempre 1536 dims. */
export async function embed(textos: string[]): Promise<number[][]> {
  const geminiKey = process.env["GEMINI_API_KEY"]?.trim();
  const openAIKey = process.env["OPENAI_API_KEY"]?.trim();
  const lovableKey = process.env["LOVABLE_API_KEY"]?.trim();

  if (!geminiKey && !openAIKey && !lovableKey) {
    throw new AIError(
      "Serviço de embeddings não configurado — define GEMINI_API_KEY (preferido)",
      500,
    );
  }

  if (geminiKey) {
    try {
      return await embedViaGemini(textos, geminiKey);
    } catch (e) {
      if (!lovableKey && !openAIKey) throw e;
      console.warn("Gemini embeddings falhou — a tentar fallback", e);
    }
  }

  if (lovableKey) {
    try {
      return await embedViaLovable(textos, lovableKey);
    } catch (e) {
      if (!openAIKey) throw e;
      console.warn("Lovable embeddings falhou — a tentar OpenAI");
    }
  }

  if (openAIKey) {
    try {
      return await embedViaOpenAI(textos, openAIKey);
    } catch (e) {
      if (e instanceof AIError && e.status === 402 && !lovableKey && !geminiKey) {
        throw new AIError(
          "Créditos OpenAI esgotados — define GEMINI_API_KEY ou LOVABLE_API_KEY no .env",
          402,
        );
      }
      throw e;
    }
  }

  throw new AIError("Falha a gerar embeddings", 500);
}
