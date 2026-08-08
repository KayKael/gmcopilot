/**
 * Runtime de transcrição fora do ciclo de vida do React.
 * O TopBar remonta em cada rota — a ligação WebRTC tem de sobreviver.
 */

import { iniciarTranscricao, type SessaoTranscricao } from "@/lib/realtime-client";
import { obterMicrofoneGuardado } from "@/lib/mic-device";

export type EstadoTranscricao = "a-ligar" | "ligado" | "fechado" | "erro";

type Callbacks = {
  onParcial: (texto: string) => void;
  onFinal: (texto: string) => void;
  onEstado: (estado: EstadoTranscricao) => void;
};

let sessao: SessaoTranscricao | null = null;
let sessionId: string | null = null;
let aParar = false;
let cbs: Callbacks = {
  onParcial: () => {},
  onFinal: () => {},
  onEstado: () => {},
};

export function actualizarCallbacksTranscricao(novos: Partial<Callbacks>) {
  cbs = { ...cbs, ...novos };
}

export function obterSessionIdActivo() {
  return sessionId;
}

export function definirSessionIdActivo(id: string | null) {
  sessionId = id;
}

export function obterSessaoTranscricao() {
  return sessao;
}

export function marcarPararTranscricao(valor: boolean) {
  aParar = valor;
}

export async function ligarTranscricaoRuntime(token: string): Promise<SessaoTranscricao> {
  if (sessao) {
    try {
      sessao.parar();
    } catch {
      /* ignorar */
    }
    sessao = null;
  }

  sessao = await iniciarTranscricao({
    token,
    deviceId: obterMicrofoneGuardado(),
    onParcial: (t) => {
      if (!aParar) cbs.onParcial(t);
    },
    onFinal: (t) => {
      if (!aParar) cbs.onFinal(t);
    },
    onEstado: (estado) => {
      if (aParar && estado !== "fechado") return;
      cbs.onEstado(estado);
    },
  });
  return sessao;
}

export function pararTranscricaoRuntime() {
  aParar = true;
  const actual = sessao;
  sessao = null;
  try {
    actual?.parar();
  } catch {
    /* ignorar */
  }
}

export function setMudoRuntime(mudo: boolean) {
  sessao?.setMudo(mudo);
}
