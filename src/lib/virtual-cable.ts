/** Detecção de cabos virtuais (VB-Cable, etc.) para expor a voz alterada no Windows. */

export const VB_CABLE_DOWNLOAD = "https://vb-audio.com/Cable/";

/** Nomes típicos da saída “CABLE Input” (para onde a app escreve). */
const PADROES_SAIDA_CABO = [
  /cable\s*input/i,
  /vb-?audio\s*virtual\s*cable/i,
  /voicemeeter\s*(input|aux|vaio)/i,
  /cable\s*a\s*input/i,
  /cable\s*b\s*input/i,
];

/** Nomes típicos da entrada “CABLE Output” (o que Discord/Zoom escolhem como microfone). */
const PADROES_ENTRADA_CABO = [
  /cable\s*output/i,
  /vb-?audio\s*virtual\s*cable/i,
  /voicemeeter\s*(output|aux|vaio)/i,
  /cable\s*a\s*output/i,
  /cable\s*b\s*output/i,
];

export function ehSaidaCaboVirtual(label: string): boolean {
  return PADROES_SAIDA_CABO.some((re) => re.test(label));
}

export function ehEntradaCaboVirtual(label: string): boolean {
  return PADROES_ENTRADA_CABO.some((re) => re.test(label));
}

export function encontrarSaidaCabo(
  saidas: MediaDeviceInfo[],
): MediaDeviceInfo | null {
  return (
    saidas.find((d) => d.kind === "audiooutput" && ehSaidaCaboVirtual(d.label)) ??
    null
  );
}

export function encontrarEntradaCabo(
  entradas: MediaDeviceInfo[],
): MediaDeviceInfo | null {
  return (
    entradas.find((d) => d.kind === "audioinput" && ehEntradaCaboVirtual(d.label)) ??
    null
  );
}

export async function listarDispositivosAudio(): Promise<{
  saidas: MediaDeviceInfo[];
  entradas: MediaDeviceInfo[];
}> {
  const lista = await navigator.mediaDevices.enumerateDevices();
  return {
    saidas: lista.filter((d) => d.kind === "audiooutput"),
    entradas: lista.filter((d) => d.kind === "audioinput"),
  };
}
