import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { classificarCena } from "@/lib/cena.functions";
import { SFX_KEYS, type SceneKey } from "@/lib/scenes";
import { useSessionStore } from "@/store/session";
import { useMudarCena } from "@/hooks/useCena";

const INTERVALO_MS = 15_000;
const COOLDOWN_MS = 30_000;
const PAUSA_MANUAL_MS = 120_000;
const LIMIAR = 0.7;
const LIMIAR_FORTE = 0.9;

/** Classificação automática de cena a partir da transcrição. */
export function useClassificador() {
  const pedir = useServerFn(classificarCena);
  const mudarCena = useMudarCena();
  const { linhas, scenes, autoClassify, status, cenaAtual, origem } = useSessionStore();
  const [aClassificar, setAClassificar] = useState(false);

  const ultimoTexto = useRef("");
  const ultimaTroca = useRef(0);
  const candidata = useRef<string | null>(null);
  const pausaManual = useRef(0);

  useEffect(() => {
    if (origem === "manual") pausaManual.current = Date.now() + PAUSA_MANUAL_MS;
  }, [origem, cenaAtual]);

  const classificar = useCallback(
    async (forcado: boolean) => {
      if (!scenes.length) return;
      const janela = useSessionStore
        .getState()
        .linhas.slice(-8)
        .map((l) => l.texto)
        .join(" ")
        .slice(-1200);
      if (!forcado && janela === ultimoTexto.current) return;
      ultimoTexto.current = janela;
      if (janela.trim().length < 40) {
        if (forcado) toast.error("Ainda não há transcrição suficiente");
        return;
      }

      setAClassificar(true);
      try {
        const r = await pedir({
          data: {
            texto: janela,
            cenas: scenes.map((s) => s.key),
            sfx: [...SFX_KEYS],
          },
        });
        if (!r) return;
        const agora = Date.now();
        if (forcado) {
          await mudarCena(r.cena as SceneKey, "manual", r.confianca, r.sfx_sugeridos);
          ultimaTroca.current = agora;
          return;
        }
        if (agora < pausaManual.current) return;
        if (agora - ultimaTroca.current < COOLDOWN_MS) return;
        if (r.cena === useSessionStore.getState().cenaAtual) {
          candidata.current = null;
          return;
        }
        const repetida = candidata.current === r.cena;
        candidata.current = r.cena;
        if (r.confianca >= LIMIAR_FORTE || (r.confianca >= LIMIAR && repetida)) {
          candidata.current = null;
          ultimaTroca.current = agora;
          await mudarCena(r.cena as SceneKey, "auto", r.confianca, r.sfx_sugeridos);
        }
      } catch (e) {
        console.error(e);
        toast.error("Classificação de cena indisponível");
      } finally {
        setAClassificar(false);
      }
    },
    [mudarCena, pedir, scenes],
  );

  useEffect(() => {
    if (!autoClassify || status !== "ativa") return;
    const id = setInterval(() => void classificar(false), INTERVALO_MS);
    return () => clearInterval(id);
  }, [autoClassify, classificar, status, linhas.length]);

  return { classificarAgora: () => void classificar(true), aClassificar };
}
