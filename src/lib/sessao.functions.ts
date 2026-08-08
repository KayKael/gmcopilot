import { createServerFn } from "@tanstack/react-start";

export interface SessaoResumo {
  id: string;
  nome: string | null;
  started_at: string;
  ended_at: string | null;
  resumo: string | null;
  linhas: number;
}

/** Lista as sessões com o número de linhas transcritas. */
export const listarSessoes = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessaoResumo[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sessoes, error } = await supabaseAdmin
      .from("sessions")
      .select("id, nome, started_at, ended_at, resumo")
      .order("started_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const { data: linhas } = await supabaseAdmin.from("transcript_lines").select("session_id");
    const contagem = new Map<string, number>();
    for (const l of linhas ?? []) {
      if (l.session_id) contagem.set(l.session_id, (contagem.get(l.session_id) ?? 0) + 1);
    }
    return (sessoes ?? []).map((s) => ({ ...s, linhas: contagem.get(s.id) ?? 0 }));
  },
);

/** Detalhe de uma sessão: resumo, transcrição e linha do tempo de cenas. */
export const obterSessao = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [sessao, linhas, eventos] = await Promise.all([
      supabaseAdmin.from("sessions").select("*").eq("id", data.id).maybeSingle(),
      supabaseAdmin
        .from("transcript_lines")
        .select("id, ts, texto")
        .eq("session_id", data.id)
        .order("ts"),
      supabaseAdmin
        .from("scene_events")
        .select("id, ts, cena, origem, confianca")
        .eq("session_id", data.id)
        .order("ts"),
    ]);
    if (!sessao.data) throw new Error("Sessão não encontrada");
    return {
      sessao: sessao.data,
      linhas: linhas.data ?? [],
      eventos: eventos.data ?? [],
    };
  });

/** Gera (ou regenera) o resumo de uma sessão e guarda-o. */
export const resumirSessao = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<{ resumo: string; vazio?: boolean }> => {
    const { chatTexto, MODELO_FORTE } = await import("./ai.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: linhas, error } = await supabaseAdmin
      .from("transcript_lines")
      .select("ts, texto")
      .eq("session_id", data.id)
      .order("ts");
    if (error) throw new Error(error.message);
    // Sessão sem falas captadas: não é erro, apenas não há nada para resumir.
    if (!linhas?.length) return { resumo: "", vazio: true };

    const sistema =
      "És o co-piloto de um mestre de RPG. Escreves em português europeu, de forma objetiva, em markdown.";
    const formato =
      "Estrutura obrigatória:\n## Síntese\n## Decisões dos jogadores\n## NPCs e locais\n## Ganchos em aberto\n## Ações para o mestre";

    const texto = linhas.map((l) => l.texto).join("\n");
    const BLOCO = 12000;
    let base = texto;

    if (texto.length > BLOCO) {
      const blocos: string[] = [];
      for (let i = 0; i < texto.length; i += BLOCO) blocos.push(texto.slice(i, i + BLOCO));
      const parciais: string[] = [];
      for (const b of blocos) {
        parciais.push(
          await chatTexto([
            { role: "system", content: sistema },
            {
              role: "user",
              content: `Resume em bullets o que aconteceu neste excerto da sessão:\n"""\n${b}\n"""`,
            },
          ]),
        );
      }
      base = parciais.join("\n\n");
    }

    const resumo = await chatTexto(
      [
        { role: "system", content: sistema },
        {
          role: "user",
          content: `${formato}\n\nConteúdo da sessão:\n"""\n${base}\n"""`,
        },
      ],
      MODELO_FORTE,
    );

    const { error: upErr } = await supabaseAdmin
      .from("sessions")
      .update({ resumo })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { resumo };
  });

/** Renomeia uma sessão. */
export const renomearSessao = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; nome: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("sessions").update({ nome: data.nome }).eq("id", data.id);
    return { ok: true };
  });

/** Apaga uma sessão e a respetiva transcrição. */
export const apagarSessao = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("transcript_lines").delete().eq("session_id", data.id);
    await supabaseAdmin.from("scene_events").delete().eq("session_id", data.id);
    await supabaseAdmin.from("sessions").delete().eq("id", data.id);
    return { ok: true };
  });
