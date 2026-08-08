import { createServerFn } from "@tanstack/react-start";

export interface ResultadoClassificacao {
  cena: string;
  confianca: number;
  sfx_sugeridos: string[];
  mood: string;
  mood_confianca: number;
}

export interface MoodCatalogoItem {
  key: string;
  nome: string;
  descricao: string;
}

/** Classifica a cena e o mood musical a partir das falas + cena actual. */
export const classificarCena = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      texto: string;
      cenas: string[];
      sfx: string[];
      moods: MoodCatalogoItem[];
      cenaAtual: string | null;
      moodAtual: string | null;
    }) => input,
  )
  .handler(async ({ data }): Promise<ResultadoClassificacao | null> => {
    const texto = data.texto.trim();
    if (texto.length < 40) return null;
    const { chatEstruturado } = await import("./ai.server");

    const moodsLista = data.moods
      .map((m) => `- ${m.key} (${m.nome}): ${m.descricao}`)
      .join("\n");
    const moodKeys = data.moods.map((m) => m.key);

    return chatEstruturado<ResultadoClassificacao>(
      [
        {
          role: "system",
          content:
            "És um assistente de mestre de RPG (Ordem Paranormal / D&D) em português europeu. " +
            "Classificas (1) o tipo de cena UI e (2) o mood musical. " +
            "O mood musical DEVE ser escolhido automaticamente com base na TRANSCRIÇÃO e na CENA ACTUAL (ou na cena que acabas de classificar). " +
            "A cena define a família (combate, exploração, tensão…); a transcrição define o subtipo e a intensidade " +
            "(ex.: combate + boss → combate_epico; combate + ritual → batalha_sagrada; exploração + pistas → investigacao). " +
            "Não cries moods fora do catálogo. Se estiveres inseguro, devolve confiança baixa. Responde sempre pela ferramenta.",
        },
        {
          role: "user",
          content:
            `Cena actual na mesa: ${data.cenaAtual ?? "nenhuma"}.\n` +
            `Mood musical actual: ${data.moodAtual ?? "nenhum"}.\n` +
            `Cenas possíveis: ${data.cenas.join(", ")}.\n` +
            `Efeitos sonoros disponíveis: ${data.sfx.join(", ")}.\n\n` +
            `Moods musicais (escolhe exactamente uma key, alinhada à cena + tom das falas):\n${moodsLista}\n\n` +
            `Últimas falas:\n"""\n${texto}\n"""`,
        },
      ],
      {
        name: "classificar_cena_mood",
        description:
          "Devolve a cena UI, o mood musical (com base na transcrição + cena), confianças e efeitos sonoros.",
        parameters: {
          type: "object",
          properties: {
            cena: { type: "string", enum: data.cenas },
            confianca: { type: "number", description: "Confiança da cena entre 0 e 1" },
            sfx_sugeridos: {
              type: "array",
              items: { type: "string", enum: data.sfx },
              description: "Até 3 efeitos sonoros adequados ao momento",
            },
            mood: {
              type: "string",
              enum: moodKeys.length ? moodKeys : ["base"],
              description:
                "Key do mood musical, escolhida pela transcrição e pela cena actual/classificada",
            },
            mood_confianca: {
              type: "number",
              description: "Confiança do mood entre 0 e 1",
            },
          },
          required: ["cena", "confianca", "sfx_sugeridos", "mood", "mood_confianca"],
        },
      },
    );
  });
