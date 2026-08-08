import { createServerFn } from "@tanstack/react-start";

/**
 * Cria um token efémero da OpenAI Realtime (modo transcrição).
 * A chave real nunca chega ao browser.
 *
 * Nota: gpt-live-transcribe não aceita server_vad — usamos gpt-4o-transcribe
 * com VAD para fechar turnos automaticamente durante a sessão.
 */
export const criarTokenTranscricao = createServerFn({ method: "POST" }).handler(async () => {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY em falta no servidor");

  const sessao = {
    type: "transcription",
    audio: {
      input: {
        format: { type: "audio/pcm", rate: 24000 },
        transcription: {
          model: "gpt-4o-transcribe",
          language: "pt",
          prompt:
            "Sessão de RPG de mesa em português europeu. Termos de D&D, nomes próprios de fantasia.",
        },
        noise_reduction: { type: "near_field" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.45,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
        },
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
    if (res.status === 429 || /credit|quota|billing/i.test(detalhe)) {
      throw new Error("Créditos OpenAI esgotados — não consigo iniciar a transcrição");
    }
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
