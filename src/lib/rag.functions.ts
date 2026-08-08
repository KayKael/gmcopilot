import { createServerFn } from "@tanstack/react-start";

export interface DocResumo {
  doc_name: string;
  chunks: number;
}

export interface RespostaRag {
  resposta: string;
  fontes: { doc_name: string; content: string; similarity: number }[];
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
      const lote = pedacos.slice(i, i + 64);
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

/** Responde a uma pergunta com base nas notas da campanha. */
export const perguntarDocs = createServerFn({ method: "POST" })
  .inputValidator((input: { pergunta: string }) => input)
  .handler(async ({ data }): Promise<RespostaRag> => {
    const { embed, chatTexto, MODELO_FORTE } = await import("./ai.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [vetor] = await embed([data.pergunta]);
    const { data: matches, error } = await supabaseAdmin.rpc("match_documents", {
      query_embedding: JSON.stringify(vetor) as unknown as string,
      match_threshold: 0.2,
      match_count: 6,
    });
    if (error) throw new Error(error.message);
    const fontes = (matches ?? []) as RespostaRag["fontes"];
    if (!fontes.length) {
      return { resposta: "Não encontrei nada sobre isso nas tuas notas.", fontes: [] };
    }

    const contexto = fontes
      .map((f, i) => `[${i + 1}] (${f.doc_name})\n${f.content}`)
      .join("\n\n");
    const resposta = await chatTexto(
      [
        {
          role: "system",
          content:
            "És o co-piloto de um mestre de RPG. Responde em português europeu, de forma curta e direta (máx. 4 frases), usando apenas os excertos fornecidos. Se os excertos não responderem, diz exatamente: Não encontrei nas tuas notas.",
        },
        { role: "user", content: `Excertos:\n${contexto}\n\nPergunta: ${data.pergunta}` },
      ],
      MODELO_FORTE,
    );
    return { resposta, fontes };
  });
