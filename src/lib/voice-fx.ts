import { restricoesAudio } from "@/lib/mic-device";
import type { VoiceFxParams } from "@/lib/voice-presets";

export type VoiceFxEngine = {
  actualizar(params: VoiceFxParams): void;
  definirMonitor(ligado: boolean): void;
  definirSaida(deviceId: string | null): Promise<void>;
  obterNivel(): number;
  parar(): Promise<void>;
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

type CtxComSink = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export async function iniciarVoiceFx(opcoes?: {
  deviceId?: string | null;
  outputId?: string | null;
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

  if (opcoes?.outputId && typeof ctx.setSinkId === "function") {
    try {
      await ctx.setSinkId(opcoes.outputId);
    } catch {
      /* dispositivo inválido — fica o default */
    }
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
  const monitor = ctx.createGain();
  // Força L+R iguais (mic é mono; sem isto o browser pode mandar só para um lado)
  const stereo = ctx.createChannelMerger(2);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  const nivelBuf = new Uint8Array(analyser.frequencyBinCount);

  // source → pitch → dist → bass → lowpass → [dry | reverb] → monitor → L+R → dest
  source.connect(pitch);
  pitch.connect(dist);
  dist.connect(bass);
  bass.connect(lowpass);
  lowpass.connect(dryGain);
  lowpass.connect(reverbIn);
  reverbIn.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(monitor);
  wetGain.connect(monitor);
  monitor.connect(stereo, 0, 0);
  monitor.connect(stereo, 0, 1);
  stereo.connect(analyser);
  analyser.connect(ctx.destination);

  let monitorLigado = opcoes?.monitorLigado ?? true;
  let paramsActuais = { ...opcoes!.params };

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

    const g = monitorLigado ? Math.max(0, Math.min(1, p.monitorGain)) : 0;
    monitor.gain.setTargetAtTime(g, ctx.currentTime, 0.03);
  };

  aplicar(paramsActuais);

  return {
    actualizar(p) {
      aplicar(p);
    },
    definirMonitor(ligado) {
      monitorLigado = ligado;
      const g = ligado ? Math.max(0, Math.min(1, paramsActuais.monitorGain)) : 0;
      monitor.gain.setTargetAtTime(g, ctx.currentTime, 0.03);
    },
    async definirSaida(deviceId) {
      if (typeof ctx.setSinkId !== "function") return;
      await ctx.setSinkId(deviceId ?? "");
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
    async parar() {
      try {
        source.disconnect();
        pitch.disconnect();
        dist.disconnect();
        bass.disconnect();
        lowpass.disconnect();
        dryGain.disconnect();
        wetGain.disconnect();
        reverbIn.disconnect();
        convolver.disconnect();
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
