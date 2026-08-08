import { createServerFn } from "@tanstack/react-start";

/**
 * Transcreve um bloco WAV (base64). Usa a Lovable AI Gateway com um modelo
 * leve de transcrição; se falhar e existir OPENAI_API_KEY, tenta a OpenAI.
 */
export const transcreverBloco = createServerFn({ method: "POST" })
  .inputValidator((data: { wavBase64: string }) => {
    if (!data?.wavBase64) throw new Error("Áudio em falta");
    return data;
  })
  .handler(async ({ data }) => {
    const bin = atob(data.wavBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length < 4000) return { texto: "" };
    const blob = new Blob([bytes], { type: "audio/wav" });

    async function pedir(url: string, key: string, model: string) {
      const form = new FormData();
      form.append("model", model);
      form.append("file", blob, "bloco.wav");
      form.append("language", "pt");
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      if (!res.ok) {
        const detalhe = await res.text().catch(() => "");
        throw new Error(`${res.status} ${detalhe.slice(0, 300)}`);
      }
      const json = (await res.json()) as { text?: string };
      return (json.text ?? "").trim();
    }

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const openaiKey = process.env["OPENAI_API_KEY"];

    if (lovableKey) {
      try {
        return {
          texto: await pedir(
            "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
            lovableKey,
            "openai/gpt-4o-mini-transcribe",
          ),
        };
      } catch (e) {
        console.error("Transcrição (Lovable):", e);
      }
    }

    if (openaiKey) {
      return {
        texto: await pedir(
          "https://api.openai.com/v1/audio/transcriptions",
          openaiKey,
          "gpt-4o-mini-transcribe",
        ),
      };
    }

    throw new Error("Serviço de transcrição indisponível");
  });
