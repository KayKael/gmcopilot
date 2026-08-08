import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { classificarCena } from "@/lib/cena.functions";
import type { SceneKey } from "@/lib/scenes";
import { efeitosDoPack, resolverPackAtivo } from "@/lib/sfx-packs";
import { useSessionStore } from "@/store/session";
import { useMudarCena, useTocarMood } from "@/hooks/useCena";

const INTERVALO_MS = 15_000;
const COOLDOWN_CENA_MS = 30_000;
const COOLDOWN_MOOD_MS = 20_000;
const PAUSA_MANUAL_MS = 120_000;
const LIMIAR = 0.7;
const LIMIAR_FORTE = 0.9;
const LIMIAR_MOOD = 0.65;
const LIMIAR_MOOD_FORTE = 0.85;

/** Classificação automática de cena + mood DJ (transcrição + cena actual). */
export function useClassificador() {
  const pedir = useServerFn(classificarCena);
  const mudarCena = useMudarCena();
  const tocarMood = useTocarMood();
  const { linhas, scenes, autoClassify, djAuto, status, cenaAtual, origem } =
    useSessionStore();
  const [aClassificar, setAClassificar] = useState(false);

  const ultimoFingerprint = useRef("");
  const ultimaTrocaCena = useRef(0);
  const ultimaTrocaMood = useRef(0);
  const candidataCena = useRef<string | null>(null);
  const candidataMood = useRef<string | null>(null);
  const pausaManualCena = useRef(0);

  useEffect(() => {
    if (origem === "manual") pausaManualCena.current = Date.now() + PAUSA_MANUAL_MS;
  }, [origem, cenaAtual]);

  // Mudança de cena (manual ou auto) → reavaliar mood mesmo sem texto novo
  useEffect(() => {
    if (!cenaAtual) return;
    ultimoFingerprint.current = "";
  }, [cenaAtual]);

  const classificar = useCallback(
    async (forcado: boolean) => {
      if (!scenes.length) return;
      const state0 = useSessionStore.getState();
      const janela = state0.linhas
        .slice(-8)
        .map((l) => l.texto)
        .join(" ")
        .slice(-1200);
      // Inclui cena: mood depende da transcrição E da cena actual
      const fingerprint = `${state0.cenaAtual ?? ""}|${janela}`;
      if (!forcado && fingerprint === ultimoFingerprint.current) return;
      ultimoFingerprint.current = fingerprint;
      if (janela.trim().length < 40) {
        if (forcado) toast.error("Ainda não há transcrição suficiente");
        return;
      }

      const catalogo = state0.moods;
      if (!catalogo.length) {
        if (forcado) toast.error("Catálogo de moods ainda não carregou");
        return;
      }

      const pack = resolverPackAtivo(state0.sfxPacks, state0.sfxPackAtivo);
      const sfxPack = efeitosDoPack(pack);

      setAClassificar(true);
      try {
        const r = await pedir({
          data: {
            texto: janela,
            cenas: scenes.map((s) => s.key),
            sfx: sfxPack,
            moods: catalogo.map((m) => ({
              key: m.key,
              nome: m.nome,
              descricao: m.descricao,
            })),
            cenaAtual: state0.cenaAtual,
            moodAtual: state0.moodAtual,
          },
        });
        if (!r) return;
        const agora = Date.now();
        const state = useSessionStore.getState();

        if (forcado) {
          await mudarCena(r.cena as SceneKey, "manual", r.confianca, r.sfx_sugeridos);
          ultimaTrocaCena.current = agora;
          if (state.djAuto && r.mood && r.mood_confianca >= LIMIAR_MOOD) {
            await tocarMood(r.mood);
            ultimaTrocaMood.current = agora;
          }
          return;
        }

        // --- Cena (histerese) ---
        if (
          state.autoClassify &&
          agora >= pausaManualCena.current &&
          agora - ultimaTrocaCena.current >= COOLDOWN_CENA_MS
        ) {
          if (r.cena === state.cenaAtual) {
            candidataCena.current = null;
          } else {
            const repetida = candidataCena.current === r.cena;
            candidataCena.current = r.cena;
            if (r.confianca >= LIMIAR_FORTE || (r.confianca >= LIMIAR && repetida)) {
              candidataCena.current = null;
              ultimaTrocaCena.current = agora;
              await mudarCena(r.cena as SceneKey, "auto", r.confianca, r.sfx_sugeridos);
            }
          }
        }

        // --- Mood DJ (transcrição + cena) ---
        if (!state.djAuto) return;
        if (agora < state.moodPausaAte) return;
        if (agora - ultimaTrocaMood.current < COOLDOWN_MOOD_MS) return;
        if (!r.mood || r.mood_confianca < LIMIAR_MOOD) return;

        if (r.mood === state.moodAtual) {
          candidataMood.current = null;
          return;
        }

        const moodRepetido = candidataMood.current === r.mood;
        candidataMood.current = r.mood;
        if (
          r.mood_confianca >= LIMIAR_MOOD_FORTE ||
          (r.mood_confianca >= LIMIAR_MOOD && moodRepetido)
        ) {
          candidataMood.current = null;
          ultimaTrocaMood.current = agora;
          await tocarMood(r.mood);
        }
      } catch (e) {
        console.error(e);
        toast.error("Classificação de cena indisponível");
      } finally {
        setAClassificar(false);
      }
    },
    [mudarCena, pedir, scenes, tocarMood],
  );

  useEffect(() => {
    if (status !== "ativa" || (!autoClassify && !djAuto)) return;
    const id = setInterval(() => {
      const s = useSessionStore.getState();
      if (s.status !== "ativa") return;
      if (!s.autoClassify && !s.djAuto) return;
      void classificar(false);
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, [autoClassify, djAuto, classificar, status, linhas.length, cenaAtual]);

  return { classificarAgora: () => void classificar(true), aClassificar };
}
