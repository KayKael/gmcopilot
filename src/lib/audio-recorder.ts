export type GravadorAudio = {
  parar: () => Promise<void>;
  setMudo: (mudo: boolean) => void;
};

type OpcoesGravador = {
  intervaloMs?: number;
  deviceId?: string | null;
  onBloco: (wavBase64: string) => void;
  onErro: (erro: unknown) => void;
};

function escreverTexto(view: DataView, offset: number, texto: string) {
  for (let i = 0; i < texto.length; i += 1) view.setUint8(offset + i, texto.charCodeAt(i));
}

function criarWav(amostras: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + amostras.length * 2);
  const view = new DataView(buffer);
  escreverTexto(view, 0, "RIFF");
  view.setUint32(4, 36 + amostras.length * 2, true);
  escreverTexto(view, 8, "WAVE");
  escreverTexto(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  escreverTexto(view, 36, "data");
  view.setUint32(40, amostras.length * 2, true);
  for (let i = 0; i < amostras.length; i += 1) {
    const valor = Math.max(-1, Math.min(1, amostras[i] ?? 0));
    view.setInt16(44 + i * 2, valor < 0 ? valor * 0x8000 : valor * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

function paraBase64(bytes: Uint8Array) {
  let binario = "";
  const tamanho = 0x8000;
  for (let i = 0; i < bytes.length; i += tamanho) {
    binario += String.fromCharCode(...bytes.subarray(i, i + tamanho));
  }
  return btoa(binario);
}

export async function iniciarGravador({
  intervaloMs = 6000,
  deviceId,
  onBloco,
  onErro,
}: OpcoesGravador): Promise<GravadorAudio> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: restricoesAudio(deviceId),
  });
  const contexto = new AudioContext();
  await contexto.resume();
  const origem = contexto.createMediaStreamSource(stream);
  const processador = contexto.createScriptProcessor(4096, 1, 1);
  const ganho = contexto.createGain();
  ganho.gain.value = 0;
  const fila: Float32Array[] = [];
  let parado = false;
  let mudo = false;

  processador.onaudioprocess = (evento) => {
    if (parado || mudo) return;
    fila.push(new Float32Array(evento.inputBuffer.getChannelData(0)));
  };
  origem.connect(processador);
  processador.connect(ganho);
  ganho.connect(contexto.destination);

  const emitir = () => {
    if (parado || fila.length === 0) return;
    const total = fila.reduce((soma, parte) => soma + parte.length, 0);
    const todas = new Float32Array(total);
    let offset = 0;
    for (const parte of fila.splice(0)) {
      todas.set(parte, offset);
      offset += parte.length;
    }
    try {
      onBloco(paraBase64(criarWav(todas, contexto.sampleRate)));
    } catch (erro) {
      onErro(erro);
    }
  };

  const temporizador = window.setInterval(emitir, intervaloMs);
  return {
    setMudo(novoMudo) {
      mudo = novoMudo;
      for (const faixa of stream.getAudioTracks()) faixa.enabled = !novoMudo;
    },
    async parar() {
      if (parado) return;
      emitir();
      parado = true;
      window.clearInterval(temporizador);
      processador.disconnect();
      origem.disconnect();
      ganho.disconnect();
      for (const faixa of stream.getTracks()) faixa.stop();
      await contexto.close();
    },
  };
}