/**
 * Cliente WebRTC para a OpenAI Realtime em modo transcrição.
 * Captura o microfone e devolve texto parcial/final por callback.
 */

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

  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (op.deviceId) audio.deviceId = { exact: op.deviceId };
  const stream = await navigator.mediaDevices.getUserMedia({ audio });

  const pc = new RTCPeerConnection();
  for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
  // Recebemos áudio do modelo? Não — mas o transceiver mantém a negociação simples.
  pc.addTransceiver("audio", { direction: "sendonly" });

  const dc = pc.createDataChannel("oai-events");
  const parciais = new Map<string, string>();

  dc.addEventListener("open", () => op.onEstado("ligado"));
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
    } else if (tipo === "error") {
      console.error("Realtime:", msg.error?.message);
    }
  });

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      op.onEstado("erro");
    }
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const res = await fetch("https://api.openai.com/v1/realtime?intent=transcription", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${op.token}`,
      "Content-Type": "application/sdp",
      "OpenAI-Beta": "realtime=v1",
    },
    body: offer.sdp ?? "",
  });

  if (!res.ok) {
    stream.getTracks().forEach((t) => t.stop());
    pc.close();
    op.onEstado("erro");
    throw new Error(`Falha na ligação de transcrição (${res.status})`);
  }

  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });

  return {
    parar: () => {
      try {
        dc.close();
      } catch {
        /* ignorar */
      }
      stream.getTracks().forEach((t) => t.stop());
      pc.close();
      op.onEstado("fechado");
    },
    setMudo: (mudo: boolean) => {
      stream.getAudioTracks().forEach((t) => (t.enabled = !mudo));
    },
  };
}
