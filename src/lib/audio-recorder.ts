/**
 * Gravador de áudio por blocos: captura PCM via Web Audio e devolve
 * ficheiros WAV completos (16 kHz mono) a cada N segundos.
 * Cada bloco é auto-suficiente, por isso qualquer API de transcrição o aceita.
 */

export interface OpcoesGravador {
  deviceId?: string | null;
  /** duração de cada bloco em ms (por omissão 6000) */
  intervaloMs?: number;
  onBloco: (wavBase64: string) => void;
  onErro?: (e: unknown) => void;
}

export interface Gravador {
  parar: () => void;
  setMudo: (mudo: boolean) => void;
}

const TAXA_SAIDA = 16000;

function reamostrar(dados: Float32Array, taxaEntrada: number): Float32Array {
  if (taxaEntrada === TAXA_SAIDA) return dados;
  const ratio = taxaEntrada / TAXA_SAIDA;
  const saida = new Float32Array(Math.floor(dados.length / ratio));
  for (let i = 0; i < saida.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, dados.length - 1);
    const frac = pos - i0;
    saida[i] = (dados[i0] ?? 0) * (1 - frac) + (dados[i1] ?? 0) * frac;
  }
  return saida;
}

function paraWavBase64(chunks: Float32Array[], taxaEntrada: number): { b64: string; rms: number } {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const junto = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    junto.set(c, off);
    off += c.length;
  }
  const pcm = reamostrar(junto, taxaEntrada);

  let soma = 0;
  for (let i = 0; i < pcm.length; i++) soma += (pcm[i] ?? 0) ** 2;
  const rms = pcm.length ? Math.sqrt(soma / pcm.length) : 0;

  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const escrever = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  escrever(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  escrever(8, "WAVE");
  escrever(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TAXA_SAIDA, true);
  view.setUint32(28, TAXA_SAIDA * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  escrever(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { b64: btoa(bin), rms };
}

export async function iniciarGravador(op: OpcoesGravador): Promise<Gravador> {
  const constraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (op.deviceId) constraints.deviceId = { exact: op.deviceId };
  const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  let chunks: Float32Array[] = [];
  let mudo = false;

  node.onaudioprocess = (e) => {
    if (mudo) return;
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(node);
  // ganho zero para não ecoar o microfone nas colunas
  const silencio = ctx.createGain();
  silencio.gain.value = 0;
  node.connect(silencio);
  silencio.connect(ctx.destination);

  const enviar = () => {
    const atual = chunks;
    chunks = [];
    if (!atual.length) return;
    try {
      const { b64, rms } = paraWavBase64(atual, ctx.sampleRate);
      if (rms < 0.004) return; // silêncio — não vale a pena transcrever
      op.onBloco(b64);
    } catch (e) {
      op.onErro?.(e);
    }
  };

  const timer = window.setInterval(enviar, op.intervaloMs ?? 6000);

  return {
    parar: () => {
      window.clearInterval(timer);
      enviar();
      node.onaudioprocess = null;
      try {
        node.disconnect();
        source.disconnect();
        silencio.disconnect();
      } catch {
        /* ignorar */
      }
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => undefined);
    },
    setMudo: (v: boolean) => {
      mudo = v;
      stream.getAudioTracks().forEach((t) => (t.enabled = !v));
    },
  };
}
