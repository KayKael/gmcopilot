import { createServerFn } from "@tanstack/react-start";

export interface ResultadoClassificacao {
  cena: string;
  confianca: number;
  sfx_sugeridos: string[];
}

/** Classifica a cena atual a partir das últimas falas da mesa. */
export const classificarCena = createServerFn({ method: "POST" })
  .inputValidator((input: { texto: string; cenas: string[]; sfx: string[] }) => input)
  .handler(async ({ data }): Promise<ResultadoClassificacao | null> => {
    const texto = data.texto.trim();
    if (texto.length < 40) return null;
    const { chatEstruturado } = await import("./ai.server");

    return chatEstruturado<ResultadoClassificacao>(
      [
        {
          role: "system",
          content:
            "És um assistente de mestre de RPG (D&D) em português europeu. Recebes as últimas falas de uma mesa de jogo e classificas o tipo de cena em curso. Responde sempre pela ferramenta. Se estiveres inseguro, devolve confiança baixa.",
        },
        {
          role: "user",
          content: `Cenas possíveis: ${data.cenas.join(", ")}.\nEfeitos sonoros disponíveis: ${data.sfx.join(", ")}.\n\nÚltimas falas:\n"""\n${texto}\n"""`,
        },
      ],
      {
        name: "classificar_cena",
        description: "Devolve a cena em curso, a confiança e efeitos sonoros úteis.",
        parameters: {
          type: "object",
          properties: {
            cena: { type: "string", enum: data.cenas },
            confianca: { type: "number", description: "Entre 0 e 1" },
            sfx_sugeridos: {
              type: "array",
              items: { type: "string", enum: data.sfx },
              description: "Até 3 efeitos sonoros adequados ao momento",
            },
          },
          required: ["cena", "confianca", "sfx_sugeridos"],
        },
      },
    );
  });
