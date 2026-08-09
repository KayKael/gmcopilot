import { createServerFn } from "@tanstack/react-start";

export interface DocResumo {
  doc_name: string;
  chunks: number;
}

export interface RespostaRag {
  resposta: string;
  fontes: { doc_name: string; content: string; similarity: number }[];
}

export interface MensagemHistorico {
  role: "user" | "assistant";
  content: string;
}

/** Indexa um documento de campanha (texto simples ou markdown). */
export const indexarDocumento = createServerFn({ method: "POST" })
  .inputValidator((input: { nome: string; conteudo: string }) => input)
  .handler(async ({ data }): Promise<{ chunks: number }> => {
    const { dividirDocumento } = await import("./rag.server");
    const { embed } = await import("./ai.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const pedacos = dividirDocumento(data.conteudo);
    if (!pedacos.length) throw new Error("Documento vazio ou demasiado curto");

    await supabaseAdmin.from("doc_chunks").delete().eq("doc_name", data.nome);

    for (let i = 0; i < pedacos.length; i += 32) {
      const lote = pedacos.slice(i, i + 32);
      if (i > 0) await new Promise((r) => setTimeout(r, 400));
      const vetores = await embed(lote.map((p) => p.content));
      const linhas = lote.map((p, j) => ({
        doc_name: data.nome,
        chunk_index: p.index,
        content: p.content,
        embedding: JSON.stringify(vetores[j]),
      }));
      const { error } = await supabaseAdmin.from("doc_chunks").insert(linhas);
      if (error) throw new Error(error.message);
    }
    return { chunks: pedacos.length };
  });

/** Lista os documentos indexados. */
export const listarDocumentos = createServerFn({ method: "GET" }).handler(
  async (): Promise<DocResumo[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("doc_chunks").select("doc_name");
    if (error) throw new Error(error.message);
    const contagem = new Map<string, number>();
    for (const l of data ?? []) contagem.set(l.doc_name, (contagem.get(l.doc_name) ?? 0) + 1);
    return [...contagem.entries()]
      .map(([doc_name, chunks]) => ({ doc_name, chunks }))
      .sort((a, b) => a.doc_name.localeCompare(b.doc_name));
  },
);

/** Remove um documento e todos os seus pedaços. */
export const apagarDocumento = createServerFn({ method: "POST" })
  .inputValidator((input: { nome: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("doc_chunks").delete().eq("doc_name", data.nome);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const MAX_HISTORICO = 12;

/** Busca textual quando o vector search falha ou devolve vazio. */
async function fontesPorTexto(
  supabaseAdmin: Awaited<
    typeof import("@/integrations/supabase/client.server")
  >["supabaseAdmin"],
  pergunta: string,
): Promise<RespostaRag["fontes"]> {
  const termos = pergunta
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 4)
    .slice(0, 6);

  const { data, error } = await supabaseAdmin
    .from("doc_chunks")
    .select("doc_name, content")
    .limit(80);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (!rows.length) return [];

  const pontuados = rows.map((row) => {
    const texto = row.content.toLowerCase();
    let score = 0;
    for (const t of termos) {
      if (texto.includes(t)) score += 1;
    }
    return {
      doc_name: row.doc_name,
      content: row.content,
      similarity: termos.length ? score / termos.length : 0.3,
    };
  });

  return pontuados
    .filter((f) => f.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6);
}

/** Responde em chat com base nas notas da campanha (RAG + Gemini). */
export const perguntarDocs = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { pergunta: string; historico?: MensagemHistorico[] }) => input,
  )
  .handler(async ({ data }): Promise<RespostaRag> => {
    const { embed, chatGemini } = await import("./ai.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const pergunta = data.pergunta.trim();
    if (!pergunta) throw new Error("Pergunta vazia");

    let fontes: RespostaRag["fontes"] = [];
    try {
      const [vetor] = await embed([pergunta]);
      const { data: matches, error } = await supabaseAdmin.rpc("match_documents", {
        query_embedding: JSON.stringify(vetor) as unknown as string,
        match_threshold: 0.15,
        match_count: 6,
      });
      if (error) throw new Error(error.message);
      fontes = (matches ?? []) as RespostaRag["fontes"];
    } catch (e) {
      console.warn("RAG vector falhou — fallback texto", e);
    }

    if (!fontes.length) {
      fontes = await fontesPorTexto(supabaseAdmin, pergunta);
    }

    if (!fontes.length) {
      return { resposta: "Não encontrei nada sobre isso nas tuas notas.", fontes: [] };
    }

    const contexto = fontes
      .map((f, i) => `[${i + 1}] (${f.doc_name}, relevância ${(f.similarity * 100).toFixed(0)}%)\n${f.content}`)
      .join("\n\n");

    const historico = (data.historico ?? [])
      .filter((m) => m.content.trim() && (m.role === "user" || m.role === "assistant"))
      .slice(-MAX_HISTORICO);

    const messages = [
      {
        role: "system" as const,
        content:
          "És o co-piloto de um mestre de RPG. Responde em português europeu.\n" +
          "Formato para leitura rápida no ecrã (markdown leve):\n" +
          "1) Primeira linha = resposta directa em **negrito** (1 frase).\n" +
          "2) Depois, se preciso, 2–5 bullets curtos com detalhes acionáveis.\n" +
          "3) Evita parágrafos longos; máximo ~8 linhas no total.\n" +
          "4) Destaca nomes próprios e factos-chave em **negrito**.\n" +
          "Usa só os excertos das notas. Se faltar info, diz o que falta numa linha final.\n" +
          "Não inventes lore. Mantém o contexto da conversa.",
      },
      ...historico.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
        content: `Excertos das notas da campanha:\n${contexto}\n\nPergunta actual: ${pergunta}`,
      },
    ];

    const resposta = await chatGemini(messages);
    return {
      resposta: resposta || "Não consegui formular uma resposta.",
      fontes,
    };
  });
