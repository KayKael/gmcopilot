import { createServerFn } from "@tanstack/react-start";

type EntradaTranscricao = { wavBase64: string };

export const transcreverBloco = createServerFn({ method: "POST" })
  .inputValidator((entrada: EntradaTranscricao) => entrada)
  .handler(async ({ data }) => {
    if (!data.wavBase64 || data.wavBase64.length > 16_000_000) {
      throw new Error("Bloco de áudio inválido");
    }
    const chave = process.env["LOVABLE_API_KEY"];
    if (!chave) throw new Error("Serviço de transcrição indisponível");

    const binario = Uint8Array.from(atob(data.wavBase64), (carater) => carater.charCodeAt(0));
    const formulario = new FormData();
    formulario.append("file", new Blob([binario], { type: "audio/wav" }), "bloco.wav");
    formulario.append("model", "openai/gpt-4o-mini-transcribe");
    formulario.append("language", "pt");
    formulario.append("response_format", "json");

    const resposta = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}` },
      body: formulario,
    });
    if (!resposta.ok) {
      const detalhe = await resposta.text();
      console.error("Falha na transcrição:", resposta.status, detalhe.slice(0, 500));
      throw new Error("Não consegui transcrever este bloco de áudio");
    }
    const resultado = (await resposta.json()) as { text?: string };
    return { texto: resultado.text?.trim() ?? "" };
  });