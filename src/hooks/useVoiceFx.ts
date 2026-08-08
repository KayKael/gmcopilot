import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { iniciarVoiceFx, type VoiceFxEngine } from "@/lib/voice-fx";
import {
  VOICE_PARAMS_DEFAULT,
  carregarMonitorLigado,
  carregarOutputId,
  carregarParamsGuardados,
  carregarPresetKey,
  guardarMonitorLigado,
  guardarOutputId,
  guardarParams,
  guardarPresetKey,
  presetByKey,
  type VoiceFxParams,
} from "@/lib/voice-presets";
import { obterMicrofoneGuardado } from "@/lib/mic-device";

export function useVoiceFx() {
  const engineRef = useRef<VoiceFxEngine | null>(null);
  const rafRef = useRef<number | null>(null);

  const [activo, setActivo] = useState(false);
  const [aArrancar, setAArrancar] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [presetKey, setPresetKey] = useState("etsai");
  const [personalizado, setPersonalizado] = useState(false);
  const [params, setParams] = useState<VoiceFxParams>(VOICE_PARAMS_DEFAULT);
  const [monitorLigado, setMonitorLigado] = useState(true);
  const [outputId, setOutputId] = useState<string | null>(null);
  const [saidas, setSaidas] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const key = carregarPresetKey();
    const guardados = carregarParamsGuardados();
    const preset = presetByKey(key);
    setPresetKey(key);
    setMonitorLigado(carregarMonitorLigado());
    setOutputId(carregarOutputId());
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

  const listarSaidas = useCallback(async () => {
    try {
      const lista = await navigator.mediaDevices.enumerateDevices();
      setSaidas(lista.filter((d) => d.kind === "audiooutput"));
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

  const parar = useCallback(async () => {
    pararLoopNivel();
    const eng = engineRef.current;
    engineRef.current = null;
    setActivo(false);
    if (eng) await eng.parar();
  }, []);

  useEffect(() => () => void parar(), [parar]);

  const activar = useCallback(async () => {
    if (engineRef.current || aArrancar) return;
    setAArrancar(true);
    try {
      const eng = await iniciarVoiceFx({
        deviceId: obterMicrofoneGuardado(),
        outputId,
        params,
        monitorLigado,
      });
      engineRef.current = eng;
      setActivo(true);
      void listarSaidas();

      const tick = () => {
        if (!engineRef.current) return;
        setNivel(engineRef.current.obterNivel());
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (erro) {
      console.error(erro);
      toast.error("Não foi possível activar a alteração de voz. Verifica o microfone.");
    } finally {
      setAArrancar(false);
    }
  }, [aArrancar, listarSaidas, monitorLigado, outputId, params]);

  const aplicarParams = useCallback((next: VoiceFxParams, marcarPersonalizado = true) => {
    setParams(next);
    guardarParams(next);
    if (marcarPersonalizado) setPersonalizado(true);
    engineRef.current?.actualizar(next);
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

  const alternarMonitor = useCallback(
    (ligado: boolean) => {
      setMonitorLigado(ligado);
      guardarMonitorLigado(ligado);
      engineRef.current?.definirMonitor(ligado);
    },
    [],
  );

  const escolherSaida = useCallback(async (id: string | null) => {
    setOutputId(id);
    guardarOutputId(id);
    try {
      await engineRef.current?.definirSaida(id);
    } catch {
      toast.error("Não foi possível mudar a saída de áudio.");
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
    activar,
    parar,
    escolherPreset,
    actualizarCampo,
    alternarMonitor,
    escolherSaida,
  };
}
