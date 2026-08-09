import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  activarVoiceFxRuntime,
  actualizarVoiceFxRuntime,
  definirExporSistemaRuntime,
  definirMonitorVoiceFxRuntime,
  definirSaidaVoiceFxRuntime,
  obterNivelVoiceFx,
  pararVoiceFxRuntime,
  subscreverVoiceFxRuntime,
  voiceFxAArrancar,
  voiceFxCaboEntradaLabel,
  voiceFxEstaActivo,
  voiceFxExpoeSistema,
} from "@/lib/voice-fx-runtime";
import {
  VOICE_PARAMS_DEFAULT,
  carregarExporSistema,
  carregarMonitorLigado,
  carregarOutputId,
  carregarParamsGuardados,
  carregarPresetKey,
  guardarExporSistema,
  guardarMonitorLigado,
  guardarOutputId,
  guardarParams,
  guardarPresetKey,
  presetByKey,
  type VoiceFxParams,
} from "@/lib/voice-presets";
import {
  VB_CABLE_DOWNLOAD,
  encontrarSaidaCabo,
  listarDispositivosAudio,
} from "@/lib/virtual-cable";

export function useVoiceFx() {
  const rafRef = useRef<number | null>(null);

  const [activo, setActivo] = useState(() =>
    typeof window !== "undefined" ? voiceFxEstaActivo() : false,
  );
  const [aArrancar, setAArrancar] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [presetKey, setPresetKey] = useState("etsai");
  const [personalizado, setPersonalizado] = useState(false);
  const [params, setParams] = useState<VoiceFxParams>(VOICE_PARAMS_DEFAULT);
  const [monitorLigado, setMonitorLigado] = useState(true);
  const [outputId, setOutputId] = useState<string | null>(null);
  const [saidas, setSaidas] = useState<MediaDeviceInfo[]>([]);
  const [exporSistema, setExporSistema] = useState(true);
  const [caboDetectado, setCaboDetectado] = useState(false);
  const [micSistemaLabel, setMicSistemaLabel] = useState<string | null>(null);

  useEffect(() => {
    const key = carregarPresetKey();
    const guardados = carregarParamsGuardados();
    const preset = presetByKey(key);
    setPresetKey(key);
    setMonitorLigado(carregarMonitorLigado());
    setOutputId(carregarOutputId());
    setExporSistema(carregarExporSistema());
    if (guardados) {
      setParams(guardados);
      const base = preset?.params;
      const igual =
        base &&
        Object.keys(base).every(
          (k) =>
            Math.abs(
              (guardados as Record<string, number>)[k]! -
                (base as Record<string, number>)[k]!,
            ) < 0.001,
        );
      setPersonalizado(!igual);
    } else if (preset) {
      setParams(preset.params);
    }
  }, []);

  const sincronizar = useCallback(() => {
    setActivo(voiceFxEstaActivo());
    setAArrancar(voiceFxAArrancar());
    setExporSistema((prev) => (voiceFxEstaActivo() ? voiceFxExpoeSistema() : prev));
    setMicSistemaLabel(voiceFxCaboEntradaLabel());
  }, []);

  useEffect(() => subscreverVoiceFxRuntime(sincronizar), [sincronizar]);

  const listarSaidas = useCallback(async () => {
    try {
      const { saidas: lista } = await listarDispositivosAudio();
      setSaidas(lista);
      setCaboDetectado(!!encontrarSaidaCabo(lista));
    } catch {
      /* sem permissão */
    }
  }, []);

  useEffect(() => {
    void listarSaidas();
    navigator.mediaDevices?.addEventListener?.("devicechange", listarSaidas);
    return () =>
      navigator.mediaDevices?.removeEventListener?.("devicechange", listarSaidas);
  }, [listarSaidas]);

  const pararLoopNivel = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setNivel(0);
  };

  useEffect(() => {
    if (!activo) {
      pararLoopNivel();
      return;
    }
    const tick = () => {
      if (!voiceFxEstaActivo()) return;
      setNivel(obterNivelVoiceFx());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return pararLoopNivel;
  }, [activo]);

  const parar = useCallback(async () => {
    await pararVoiceFxRuntime();
  }, []);

  const activar = useCallback(async () => {
    if (voiceFxEstaActivo() || voiceFxAArrancar()) return;
    try {
      const querExpor = carregarExporSistema();
      const res = await activarVoiceFxRuntime({
        outputId,
        params,
        monitorLigado,
        exporSistema: querExpor,
      });
      setExporSistema(res.exporSistema);
      void listarSaidas();
      if (querExpor && !res.caboOk) {
        toast.message("VB-Cable não encontrado", {
          description:
            "Instala o VB-Cable para o Windows ver a voz alterada como microfone.",
          action: {
            label: "Descarregar",
            onClick: () => window.open(VB_CABLE_DOWNLOAD, "_blank"),
          },
        });
      } else if (res.exporSistema) {
        toast.success("Microfone de sistema activo", {
          description: `No Discord/Zoom escolhe “${voiceFxCaboEntradaLabel() ?? "CABLE Output"}”.`,
        });
      }
    } catch (erro) {
      console.error(erro);
      toast.error("Não foi possível activar a alteração de voz. Verifica o microfone.");
    }
  }, [listarSaidas, monitorLigado, outputId, params]);

  const aplicarParams = useCallback((next: VoiceFxParams, marcarPersonalizado = true) => {
    setParams(next);
    guardarParams(next);
    if (marcarPersonalizado) setPersonalizado(true);
    actualizarVoiceFxRuntime(next);
  }, []);

  const escolherPreset = useCallback(
    (key: string) => {
      const preset = presetByKey(key);
      if (!preset) return;
      setPresetKey(key);
      guardarPresetKey(key);
      setPersonalizado(false);
      aplicarParams(preset.params, false);
    },
    [aplicarParams],
  );

  const actualizarCampo = useCallback(
    <K extends keyof VoiceFxParams>(campo: K, valor: VoiceFxParams[K]) => {
      aplicarParams({ ...params, [campo]: valor }, true);
    },
    [aplicarParams, params],
  );

  const alternarMonitor = useCallback((ligado: boolean) => {
    setMonitorLigado(ligado);
    guardarMonitorLigado(ligado);
    definirMonitorVoiceFxRuntime(ligado);
  }, []);

  const escolherSaida = useCallback(async (id: string | null) => {
    setOutputId(id);
    guardarOutputId(id);
    try {
      await definirSaidaVoiceFxRuntime(id);
    } catch {
      toast.error("Não foi possível mudar a saída de áudio.");
    }
  }, []);

  const alternarExporSistema = useCallback(async (ligado: boolean) => {
    guardarExporSistema(ligado);
    if (!voiceFxEstaActivo()) {
      setExporSistema(ligado);
      return;
    }
    const res = await definirExporSistemaRuntime(ligado);
    if (ligado && !res.ok) {
      setExporSistema(false);
      guardarExporSistema(false);
      toast.error("VB-Cable não encontrado", {
        description: "Instala o cabo virtual e volta a tentar.",
        action: {
          label: "Descarregar",
          onClick: () => window.open(VB_CABLE_DOWNLOAD, "_blank"),
        },
      });
      return;
    }
    setExporSistema(ligado);
    setMicSistemaLabel(res.caboLabel);
    if (ligado) {
      toast.success("A voz vai para o Windows", {
        description: `Escolhe “${res.caboLabel ?? "CABLE Output"}” como microfone no Discord.`,
      });
    }
  }, []);

  return {
    activo,
    aArrancar,
    nivel,
    presetKey,
    personalizado,
    params,
    monitorLigado,
    outputId,
    saidas,
    exporSistema,
    caboDetectado,
    micSistemaLabel,
    vbCableUrl: VB_CABLE_DOWNLOAD,
    activar,
    parar,
    escolherPreset,
    actualizarCampo,
    alternarMonitor,
    escolherSaida,
    alternarExporSistema,
  };
}
