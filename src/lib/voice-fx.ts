import { restricoesAudio } from "@/lib/mic-device";
import type { VoiceFxParams } from "@/lib/voice-presets";

export type VoiceFxEngine = {
  actualizar(params: VoiceFxParams): void;
  definirMonitor(ligado: boolean): void;
  /** Auscultadores / saída de monitor (quando o sistema usa o cabo virtual). */
  definirSaidaMonitor(deviceId: string | null): Promise<void>;
  /**
   * Envia a voz processada para um cabo virtual (CABLE Input) → Windows vê
   * “CABLE Output” como microfone. O retorno “Ouvir-me” fica nos auscultadores.
   */
  definirExporSistema(ligado: boolean, caboSaidaId: string | null): Promise<void>;
  /** Stream da voz processada — microfone virtual interno do app. */
  obterStream(): MediaStream;
  obterNivel(): number;
  obterExporSistema(): boolean;
  parar(): Promise<void>;
};

type ElemComSink = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

type CtxComSink = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

function curvaDistorcao(amount: number): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = Math.max(0, Math.min(1, amount)) * 80 + 0.01;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function impulsoReverb(ctx: AudioContext, segundos = 1.4, decay = 2.2): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * segundos);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export async function iniciarVoiceFx(opcoes?: {
  deviceId?: string | null;
  /** Saída do cabo virtual (CABLE Input) quando exporSistema. */
  caboSaidaId?: string | null;
  /** Auscultadores para “Ouvir-me” em modo sistema. */
  monitorSaidaId?: string | null;
  exporSistema?: boolean;
  params: VoiceFxParams;
  monitorLigado?: boolean;
}): Promise<VoiceFxEngine> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: restricoesAudio(opcoes?.deviceId),
  });

  const ctx = new AudioContext() as CtxComSink;
  if (ctx.state === "suspended") await ctx.resume();

  try {
    await ctx.audioWorklet.addModule("/worklets/pitch-shift-processor.js");
  } catch (erro) {
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
    throw erro;
  }

  const source = ctx.createMediaStreamSource(stream);
  const pitch = new AudioWorkletNode(ctx, "pitch-shift-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
  });
  const dist = ctx.createWaveShaper();
  dist.oversample = "2x";
  dist.channelCount = 2;
  dist.channelCountMode = "explicit";
  dist.channelInterpretation = "speakers";
  const bass = ctx.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = 220;
  bass.channelCount = 2;
  bass.channelCountMode = "explicit";
  bass.channelInterpretation = "speakers";
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 4200;
  lowpass.Q.value = 0.7;
  lowpass.channelCount = 2;
  lowpass.channelCountMode = "explicit";
  lowpass.channelInterpretation = "speakers";

  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = impulsoReverb(ctx);
  const reverbIn = ctx.createGain();

  const processado = ctx.createGain();
  processado.gain.value = 1;
  const virtualMic = ctx.createMediaStreamDestination();

  // Caminho “sistema”: speakers normais OU cabo virtual (CABLE Input)
  const systemBus = ctx.createGain();
  const stereo = ctx.createChannelMerger(2);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  const nivelBuf = new Uint8Array(analyser.frequencyBinCount);

  // Caminho “Ouvir-me” separado (auscultadores) quando o destino é o cabo
  const monitor = ctx.createGain();
  const monitorDest = ctx.createMediaStreamDestination();
  const monitorEl = new Audio() as ElemComSink;
  monitorEl.autoplay = true;
  monitorEl.srcObject = monitorDest.stream;

  source.connect(pitch);
  pitch.connect(dist);
  dist.connect(bass);
  bass.connect(lowpass);
  lowpass.connect(dryGain);
  lowpass.connect(reverbIn);
  reverbIn.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(processado);
  wetGain.connect(processado);

  processado.connect(virtualMic);
  processado.connect(systemBus);
  processado.connect(monitor);
  systemBus.connect(stereo, 0, 0);
  systemBus.connect(stereo, 0, 1);
  stereo.connect(analyser);
  analyser.connect(ctx.destination);
  monitor.connect(monitorDest);

  let monitorLigado = opcoes?.monitorLigado ?? true;
  let exporSistema = false;
  let caboSaidaId: string | null = opcoes?.caboSaidaId ?? null;
  let monitorSaidaId: string | null = opcoes?.monitorSaidaId ?? null;
  let paramsActuais = { ...opcoes!.params };

  const aplicarGanhosMonitor = () => {
    const g = Math.max(0, Math.min(1, paramsActuais.monitorGain));
    if (exporSistema) {
      // Cabo recebe sempre a voz completa; retorno só nos auscultadores
      systemBus.gain.setTargetAtTime(1, ctx.currentTime, 0.03);
      monitor.gain.setTargetAtTime(monitorLigado ? g : 0, ctx.currentTime, 0.03);
      monitorEl.volume = monitorLigado ? g : 0;
    } else {
      systemBus.gain.setTargetAtTime(monitorLigado ? g : 0, ctx.currentTime, 0.03);
      monitor.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      monitorEl.volume = 0;
    }
  };

  const aplicarSinks = async () => {
    if (typeof ctx.setSinkId === "function") {
      const sink = exporSistema ? (caboSaidaId ?? "") : (monitorSaidaId ?? "");
      try {
        await ctx.setSinkId(sink);
      } catch {
        /* dispositivo inválido */
      }
    }
    if (typeof monitorEl.setSinkId === "function") {
      try {
        // Em modo sistema, o retorno vai para auscultadores (default ou escolhido)
        await monitorEl.setSinkId(exporSistema ? (monitorSaidaId ?? "") : "");
      } catch {
        /* ignorar */
      }
    }
    if (exporSistema) {
      try {
        await monitorEl.play();
      } catch {
        /* autoplay bloqueado até gesto — o activar() já é um gesto */
      }
    } else {
      monitorEl.pause();
    }
  };

  const aplicar = (p: VoiceFxParams) => {
    paramsActuais = { ...p };
    const ratio = Math.pow(2, p.pitchSemitones / 12);
    pitch.parameters.get("pitchRatio")?.setValueAtTime(ratio, ctx.currentTime);

    dist.curve = p.distortion <= 0.01 ? null : curvaDistorcao(p.distortion);
    bass.gain.setTargetAtTime(p.bassDb, ctx.currentTime, 0.05);

    const wet = Math.max(0, Math.min(1, p.wet));
    const rev = Math.max(0, Math.min(1, p.reverb));
    dryGain.gain.setTargetAtTime(1 - wet * 0.85, ctx.currentTime, 0.05);
    wetGain.gain.setTargetAtTime(wet * rev, ctx.currentTime, 0.05);
    reverbIn.gain.setTargetAtTime(rev > 0 ? 1 : 0, ctx.currentTime, 0.05);

    aplicarGanhosMonitor();
  };

  aplicar(paramsActuais);

  if (opcoes?.exporSistema && opcoes.caboSaidaId) {
    exporSistema = true;
    caboSaidaId = opcoes.caboSaidaId;
    aplicarGanhosMonitor();
    await aplicarSinks();
  } else if (opcoes?.monitorSaidaId && typeof ctx.setSinkId === "function") {
    try {
      await ctx.setSinkId(opcoes.monitorSaidaId);
    } catch {
      /* ignorar */
    }
  }

  return {
    actualizar(p) {
      aplicar(p);
    },
    definirMonitor(ligado) {
      monitorLigado = ligado;
      aplicarGanhosMonitor();
    },
    async definirSaidaMonitor(deviceId) {
      monitorSaidaId = deviceId;
      await aplicarSinks();
    },
    async definirExporSistema(ligado, caboId) {
      exporSistema = ligado;
      if (caboId) caboSaidaId = caboId;
      if (ligado && !caboSaidaId) {
        throw new Error("Instala o VB-Cable e escolhe “CABLE Input” como saída.");
      }
      aplicarGanhosMonitor();
      await aplicarSinks();
    },
    obterStream() {
      return virtualMic.stream;
    },
    obterNivel() {
      analyser.getByteTimeDomainData(nivelBuf);
      let sum = 0;
      for (let i = 0; i < nivelBuf.length; i++) {
        const v = (nivelBuf[i]! - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / nivelBuf.length) * 3);
    },
    obterExporSistema() {
      return exporSistema;
    },
    async parar() {
      try {
        monitorEl.pause();
        monitorEl.srcObject = null;
        source.disconnect();
        pitch.disconnect();
        dist.disconnect();
        bass.disconnect();
        lowpass.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
        reverbIn.disconnect();
        convolver.disconnect();
        processado.disconnect();
        systemBus.disconnect();
        monitor.disconnect();
        stereo.disconnect();
        analyser.disconnect();
      } catch {
        /* já desligado */
      }
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
    },
  };
}
