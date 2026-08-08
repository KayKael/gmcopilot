import { createServerFn } from "@tanstack/react-start";

/**
 * Cria um token efémero da OpenAI Realtime (modo transcrição).
 * A chave real nunca chega ao browser.
 */
export const criarTokenTranscricao = createServerFn({ method: "POST" }).handler(async () => {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY em falta no servidor");

  const sessao = {
    type: "transcription",
    audio: {
      input: {
        transcription: {
          model: "gpt-4o-transcribe",
          language: "pt",
          prompt:
            "Sessão de RPG de mesa em português europeu. Termos de D&D, nomes próprios de fantasia.",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
        },
        noise_reduction: { type: "near_field" },
      },
    },
  };

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session: sessao }),
  });


  if (!res.ok) {
    const detalhe = await res.text();
    console.error("Falha a criar sessão realtime:", res.status, detalhe);
    throw new Error("Não foi possível iniciar a transcrição");
  }

  const json = (await res.json()) as {
    value?: string;
    client_secret?: { value?: string };
  };
  const token = json.value ?? json.client_secret?.value;
  if (!token) throw new Error("Resposta inesperada da OpenAI");
  return { token };
});
