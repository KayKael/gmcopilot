import { createServerFn } from "@tanstack/react-start";

type EntradaTranscricao = { wavBase64: string };

async function wavBlob(binario: Uint8Array) {
  const copia = new Uint8Array(binario.byteLength);
  copia.set(binario);
  return new Blob([copia], { type: "audio/wav" });
}

async function transcreverOpenAI(binario: Uint8Array, apiKey: string) {
  const formulario = new FormData();
  formulario.append("file", await wavBlob(binario), "bloco.wav");
  formulario.append("model", "gpt-4o-mini-transcribe");
  formulario.append("language", "pt");
  formulario.append("response_format", "json");

  const resposta = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formulario,
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    console.error("OpenAI transcription:", resposta.status, detalhe.slice(0, 500));
    const semCreditos =
      resposta.status === 429 ||
      resposta.status === 402 ||
      /credit|quota|billing/i.test(detalhe);
    if (semCreditos) throw new Error("créditos");
    throw new Error("openai");
  }
  const resultado = (await resposta.json()) as { text?: string };
  return resultado.text?.trim() ?? "";
}

async function transcreverLovable(binario: Uint8Array, apiKey: string) {
  const formulario = new FormData();
  formulario.append("file", await wavBlob(binario), "bloco.wav");
  formulario.append("model", "openai/gpt-4o-mini-transcribe");
  formulario.append("language", "pt");
  formulario.append("response_format", "json");

  const resposta = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formulario,
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text();
    console.error("Lovable transcription:", resposta.status, detalhe.slice(0, 500));
    throw new Error("lovable");
  }
  const resultado = (await resposta.json()) as { text?: string };
  return resultado.text?.trim() ?? "";
}

/**
 * Transcreve um bloco WAV (base64) — usado no teste do microfone.
 * A sessão ao vivo usa Realtime WebRTC; isto é só fallback/teste.
 */
export const transcreverBloco = createServerFn({ method: "POST" })
  .inputValidator((entrada: EntradaTranscricao) => entrada)
  .handler(async ({ data }) => {
    if (!data.wavBase64 || data.wavBase64.length > 16_000_000) {
      throw new Error("Bloco de áudio inválido");
    }
    const binario = Uint8Array.from(atob(data.wavBase64), (carater) => carater.charCodeAt(0));
    if (binario.length < 4000) return { texto: "" };

    const openai = process.env["OPENAI_API_KEY"]?.trim();
    const lovable = process.env["LOVABLE_API_KEY"]?.trim();
    const erros: string[] = [];

    // Lovable primeiro (OpenAI costuma estar sem créditos)
    if (lovable) {
      try {
        return { texto: await transcreverLovable(binario, lovable) };
      } catch (e) {
        erros.push(e instanceof Error ? e.message : "lovable");
      }
    }
    if (openai) {
      try {
        return { texto: await transcreverOpenAI(binario, openai) };
      } catch (e) {
        erros.push(e instanceof Error ? e.message : "openai");
      }
    }

    if (erros.includes("créditos") && !lovable) {
      throw new Error(
        "Créditos OpenAI esgotados — define LOVABLE_API_KEY no .env, ou usa «Iniciar Sessão» (Realtime)",
      );
    }
    if (!openai && !lovable) {
      throw new Error("Serviço de transcrição indisponível (sem LOVABLE_API_KEY / OPENAI_API_KEY)");
    }
    throw new Error("Não consegui transcrever este bloco de áudio");
  });
