import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  carregarPresentation,
  readLocalPresentation,
  subscribePresentation,
  VISUAL_STORAGE_KEY,
  type PresentationState,
} from "@/lib/visual-presentation";

export const Route = createFileRoute("/apresentar")({
  head: () => ({
    meta: [
      { title: "Apresentação — GM Co-Pilot" },
      {
        name: "description",
        content: "Ecrã de apresentação visual para a sessão de RPG.",
      },
    ],
  }),
  component: ApresentarPage,
});

type LayerState = { url: string | null; key: number };

type Layers = {
  current: LayerState;
  previous: LayerState;
  /** Duração CSS da transição (0 = sem transition no DOM). */
  fadeMs: number;
  /** true = current a opacity 1. */
  reveal: boolean;
};

function ApresentarPage() {
  const [layers, setLayers] = useState<Layers>({
    current: { url: null, key: 0 },
    previous: { url: null, key: 0 },
    fadeMs: 200,
    reveal: true,
  });

  const displayedUrl = useRef<string | null>(null);
  const layerKey = useRef(0);
  const latestEpoch = useRef(-1);
  const fadeMsRef = useRef(200);
  const swapGen = useRef(0);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  const swapTo = useCallback(
    (nextUrl: string | null, fade: number) => {
      fadeMsRef.current = fade;

      if (nextUrl === displayedUrl.current) {
        // Só mudou o fade — atualiza a duração para a próxima troca.
        setLayers((L) => (L.fadeMs === fade ? L : { ...L, fadeMs: fade }));
        return;
      }

      clearTimers();
      const gen = ++swapGen.current;
      const prev = displayedUrl.current;
      layerKey.current += 1;
      const key = layerKey.current;
      displayedUrl.current = nextUrl;

      // Corte seco
      if (fade <= 0) {
        setLayers({
          fadeMs: 0,
          reveal: true,
          current: { url: nextUrl, key },
          previous: { url: null, key: key - 1 },
        });
        return;
      }

      // Fase 1: monta a nova imagem a opacity 0 SEM transition
      // (senão o browser salta o fade e “não respeita” o slider).
      setLayers({
        fadeMs: 0,
        reveal: false,
        current: { url: nextUrl, key },
        previous: { url: prev, key: key - 1 },
      });

      // Fase 2: após paint, liga a transition ainda a opacity 0
      schedule(() => {
        if (gen !== swapGen.current) return;
        setLayers((L) =>
          L.current.key === key ? { ...L, fadeMs: fade, reveal: false } : L,
        );

        // Fase 3: no frame seguinte, revela → CSS anima opacity 0→1
        schedule(() => {
          if (gen !== swapGen.current) return;
          setLayers((L) =>
            L.current.key === key ? { ...L, fadeMs: fade, reveal: true } : L,
          );
        }, 16);
      }, 32);
    },
    [clearTimers, schedule],
  );

  const applyState = useCallback(
    (state: PresentationState) => {
      const epoch = state.epoch ?? 0;
      if (epoch <= latestEpoch.current) {
        // Mesmo epoch mas fade pode ter mudado via poll parcial — ignora.
        return;
      }
      latestEpoch.current = epoch;
      const fade =
        typeof state.fade_ms === "number" && Number.isFinite(state.fade_ms)
          ? Math.max(0, state.fade_ms)
          : fadeMsRef.current;
      swapTo(state.public_url, fade);
    },
    [swapTo],
  );

  useEffect(() => {
    const local = readLocalPresentation();
    if (local) applyState(local);

    void carregarPresentation()
      .then(applyState)
      .catch((e) => console.error(e));

    const unsub = subscribePresentation(applyState);

    const poll = window.setInterval(() => {
      try {
        const raw = localStorage.getItem(VISUAL_STORAGE_KEY);
        if (!raw) return;
        applyState(JSON.parse(raw) as PresentationState);
      } catch {
        /* ignore */
      }
    }, 120);

    return () => {
      unsub();
      window.clearInterval(poll);
      clearTimers();
    };
  }, [applyState, clearTimers]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        void toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.error(e);
    }
  }

  const transition =
    layers.fadeMs > 0 ? `opacity ${layers.fadeMs}ms ease-in-out` : "none";

  return (
    <div
      className="relative h-dvh w-dvw overflow-hidden bg-black text-white"
      onDoubleClick={() => void toggleFullscreen()}
      title="Duplo clique ou F para ecrã inteiro"
    >
      <Layer
        url={layers.previous.url}
        visible={!layers.reveal}
        transition={transition}
        z={1}
        imgKey={layers.previous.key}
      />
      <Layer
        url={layers.current.url}
        visible={layers.reveal}
        transition={transition}
        z={2}
        imgKey={layers.current.key}
      />
      {!layers.current.url && !layers.previous.url && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/40">
          À espera de imagens… (F = ecrã inteiro)
        </p>
      )}
    </div>
  );
}

function Layer({
  url,
  visible,
  transition,
  z,
  imgKey,
}: {
  url: string | null;
  visible: boolean;
  transition: string;
  z: number;
  imgKey: number;
}) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        zIndex: z,
        opacity: visible ? 1 : 0,
        transition,
        pointerEvents: "none",
        willChange: transition === "none" ? "auto" : "opacity",
      }}
    >
      {url ? (
        <img
          key={imgKey}
          src={url}
          alt=""
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      ) : null}
    </div>
  );
}
