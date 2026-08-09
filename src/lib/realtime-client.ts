/**
 * Cliente WebRTC para a OpenAI Realtime em modo transcrição.
 * Captura o microfone (físico ou voz alterada do app) e devolve texto por callback.
 */

import { abrirStreamMicrofone } from "@/lib/mic-device";

export interface OpcoesTranscricao {
  token: string;
  deviceId?: string | null;
  onParcial: (texto: string) => void;
  onFinal: (texto: string) => void;
  onEstado: (estado: "a-ligar" | "ligado" | "fechado" | "erro") => void;
}

export interface SessaoTranscricao {
  parar: () => void;
  setMudo: (mudo: boolean) => void;
}

export async function iniciarTranscricao(op: OpcoesTranscricao): Promise<SessaoTranscricao> {
  op.onEstado("a-ligar");

  const { stream } = await abrirStreamMicrofone(op.deviceId);

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);

  const dc = pc.createDataChannel("oai-events");
  const parciais = new Map<string, string>();
  let fechado = false;

  const emitirEstado = (estado: "a-ligar" | "ligado" | "fechado" | "erro") => {
    if (fechado && estado !== "fechado") return;
    op.onEstado(estado);
  };

  dc.addEventListener("open", () => emitirEstado("ligado"));
  dc.addEventListener("message", (e) => {
    let msg: {
      type?: string;
      item_id?: string;
      delta?: string;
      transcript?: string;
      error?: { message?: string };
    };
    try {
      msg = JSON.parse(e.data as string);
    } catch {
      return;
    }
    const tipo = msg.type ?? "";
    if (tipo.endsWith("input_audio_transcription.delta")) {
      const id = msg.item_id ?? "x";
      parciais.set(id, (parciais.get(id) ?? "") + (msg.delta ?? ""));
      op.onParcial([...parciais.values()].join(" ").trim());
    } else if (tipo.endsWith("input_audio_transcription.completed")) {
      const id = msg.item_id ?? "x";
      const texto = (msg.transcript ?? parciais.get(id) ?? "").trim();
      parciais.delete(id);
      op.onParcial([...parciais.values()].join(" ").trim());
      if (texto) op.onFinal(texto);
    } else if (tipo === "error" || tipo.endsWith(".error")) {
      console.error("Realtime:", msg.error?.message ?? tipo, msg);
    }
  });

  pc.addEventListener("connectionstatechange", () => {
    if (fechado) return;
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      emitirEstado("erro");
    }
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Endpoint GA: /v1/realtime/calls (o antigo ?intent=transcription devolve 400 no WebRTC)
  const res = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${op.token}`,
      "Content-Type": "application/sdp",
    },
    body: offer.sdp ?? "",
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    console.error("Falha SDP realtime:", res.status, detalhe);
    stream.getTracks().forEach((t) => t.stop());
    pc.close();
    throw new Error(`Falha na ligação de transcrição (${res.status})`);
  }

  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });

  return {
    parar: () => {
      if (fechado) return;
      fechado = true;
      try {
        dc.close();
      } catch {
        /* ignorar */
      }
      stream.getTracks().forEach((t) => t.stop());
      pc.close();
      emitirEstado("fechado");
    },
    setMudo: (mudo: boolean) => {
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !mudo;
      });
    },
  };
}
