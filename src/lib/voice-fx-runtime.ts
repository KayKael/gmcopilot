/**
 * Runtime de Voice FX fora do ciclo de vida do React.
 * Card (/audio) e painel (/voz) partilham o mesmo motor e o microfone virtual.
 */

import { iniciarVoiceFx, type VoiceFxEngine } from "@/lib/voice-fx";
import type { VoiceFxParams } from "@/lib/voice-presets";
import {
  MICROFONE_VOZ_ALTERADA,
  ehMicrofoneVozAlterada,
  guardarMicrofone,
  obterMicrofoneFisico,
  obterMicrofoneGuardado,
} from "@/lib/mic-device";
import {
  encontrarEntradaCabo,
  encontrarSaidaCabo,
  listarDispositivosAudio,
} from "@/lib/virtual-cable";

type Listener = () => void;

let engine: VoiceFxEngine | null = null;
let aArrancar = false;
let exporSistemaActivo = false;
let caboEntradaLabel: string | null = null;
const listeners = new Set<Listener>();

/** Microfone guardado antes de activar a voz alterada (para restaurar ao parar). */
let micAntes: string | null | undefined;

function notificar() {
  for (const l of listeners) l();
}

export function subscreverVoiceFxRuntime(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function voiceFxEstaActivo() {
  return engine !== null;
}

export function voiceFxAArrancar() {
  return aArrancar;
}

export function voiceFxExpoeSistema() {
  return exporSistemaActivo;
}

export function voiceFxCaboEntradaLabel() {
  return caboEntradaLabel;
}

export function obterStreamVozAlterada(): MediaStream | null {
  return engine?.obterStream() ?? null;
}

export function obterNivelVoiceFx() {
  return engine?.obterNivel() ?? 0;
}

export async function activarVoiceFxRuntime(opcoes: {
  outputId?: string | null;
  params: VoiceFxParams;
  monitorLigado?: boolean;
  exporSistema?: boolean;
}): Promise<{ exporSistema: boolean; caboOk: boolean }> {
  if (engine || aArrancar) {
    return { exporSistema: exporSistemaActivo, caboOk: !!caboEntradaLabel };
  }
  aArrancar = true;
  notificar();
  try {
    const { saidas, entradas } = await listarDispositivosAudio();
    const caboSaida = encontrarSaidaCabo(saidas);
    const caboEntrada = encontrarEntradaCabo(entradas);
    const querExpor = opcoes.exporSistema !== false;
    const podeExpor = querExpor && !!caboSaida;

    const eng = await iniciarVoiceFx({
      deviceId: obterMicrofoneFisico(),
      params: opcoes.params,
      exporSistema: podeExpor,
      ...(podeExpor && caboSaida ? { caboSaidaId: caboSaida.deviceId } : {}),
      ...(opcoes.outputId ? { monitorSaidaId: opcoes.outputId } : {}),
      ...(opcoes.monitorLigado !== undefined
        ? { monitorLigado: opcoes.monitorLigado }
        : {}),
    });
    engine = eng;
    exporSistemaActivo = podeExpor;
    caboEntradaLabel = caboEntrada?.label ?? (podeExpor ? "CABLE Output" : null);

    const actual = obterMicrofoneGuardado();
    if (!ehMicrofoneVozAlterada(actual)) {
      micAntes = actual;
      guardarMicrofone(MICROFONE_VOZ_ALTERADA);
    }

    notificar();
    return { exporSistema: podeExpor, caboOk: !!caboSaida };
  } finally {
    aArrancar = false;
    notificar();
  }
}

export async function pararVoiceFxRuntime(): Promise<void> {
  const eng = engine;
  engine = null;
  exporSistemaActivo = false;
  caboEntradaLabel = null;
  notificar();
  if (eng) await eng.parar();

  if (ehMicrofoneVozAlterada(obterMicrofoneGuardado())) {
    guardarMicrofone(micAntes === undefined ? null : micAntes);
  }
  micAntes = undefined;
  notificar();
}

export function actualizarVoiceFxRuntime(params: VoiceFxParams) {
  engine?.actualizar(params);
}

export function definirMonitorVoiceFxRuntime(ligado: boolean) {
  engine?.definirMonitor(ligado);
}

export async function definirSaidaVoiceFxRuntime(deviceId: string | null) {
  await engine?.definirSaidaMonitor(deviceId);
}

export async function definirExporSistemaRuntime(ligado: boolean): Promise<{
  ok: boolean;
  caboLabel: string | null;
}> {
  if (!engine) return { ok: false, caboLabel: null };
  if (!ligado) {
    await engine.definirExporSistema(false, null);
    exporSistemaActivo = false;
    notificar();
    return { ok: true, caboLabel: null };
  }
  const { saidas, entradas } = await listarDispositivosAudio();
  const caboSaida = encontrarSaidaCabo(saidas);
  const caboEntrada = encontrarEntradaCabo(entradas);
  if (!caboSaida) {
    return { ok: false, caboLabel: null };
  }
  await engine.definirExporSistema(true, caboSaida.deviceId);
  exporSistemaActivo = true;
  caboEntradaLabel = caboEntrada?.label ?? "CABLE Output";
  notificar();
  return { ok: true, caboLabel: caboEntradaLabel };
}
