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
  fadeMs: number;
  reveal: boolean;
};

const OVERLAY_FADE_MS = 200;

function ApresentarPage() {
  const [layers, setLayers] = useState<Layers>({
    current: { url: null, key: 0 },
    previous: { url: null, key: 0 },
    fadeMs: 200,
    reveal: true,
  });
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);

  const displayedUrl = useRef<string | null>(null);
  const displayedOverlay = useRef<string | null>(null);
  const layerKey = useRef(0);
  const latestEpoch = useRef(-1);
  const fadeMsRef = useRef(200);
  const swapGen = useRef(0);
  const overlayGen = useRef(0);
  const bgTimers = useRef<number[]>([]);
  const fxTimers = useRef<number[]>([]);

  const clearBgTimers = useCallback(() => {
    for (const t of bgTimers.current) window.clearTimeout(t);
    bgTimers.current = [];
  }, []);

  const clearFxTimers = useCallback(() => {
    for (const t of fxTimers.current) window.clearTimeout(t);
    fxTimers.current = [];
  }, []);

  const scheduleBg = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    bgTimers.current.push(id);
  }, []);

  const scheduleFx = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    fxTimers.current.push(id);
  }, []);

  const swapTo = useCallback(
    (nextUrl: string | null, fade: number) => {
      fadeMsRef.current = fade;
      if (nextUrl === displayedUrl.current) {
        setLayers((L) => (L.fadeMs === fade ? L : { ...L, fadeMs: fade }));
        return;
      }

      clearBgTimers();
      const gen = ++swapGen.current;
      const prev = displayedUrl.current;
      layerKey.current += 1;
      const key = layerKey.current;
      displayedUrl.current = nextUrl;

      if (fade <= 0) {
        setLayers({
          fadeMs: 0,
          reveal: true,
          current: { url: nextUrl, key },
          previous: { url: null, key: key - 1 },
        });
        return;
      }

      setLayers({
        fadeMs: 0,
        reveal: false,
        current: { url: nextUrl, key },
        previous: { url: prev, key: key - 1 },
      });

      scheduleBg(() => {
        if (gen !== swapGen.current) return;
        setLayers((L) =>
          L.current.key === key ? { ...L, fadeMs: fade, reveal: false } : L,
        );
        scheduleBg(() => {
          if (gen !== swapGen.current) return;
          setLayers((L) =>
            L.current.key === key ? { ...L, fadeMs: fade, reveal: true } : L,
          );
        }, 16);
      }, 32);
    },
    [clearBgTimers, scheduleBg],
  );

  const setOverlay = useCallback(
    (url: string | null) => {
      if (url === displayedOverlay.current) return;
      displayedOverlay.current = url;
      const gen = ++overlayGen.current;
      clearFxTimers();

      if (!url) {
        setOverlayVisible(false);
        scheduleFx(() => {
          if (gen !== overlayGen.current) return;
          setOverlayUrl(null);
        }, OVERLAY_FADE_MS);
        return;
      }

      setOverlayUrl(url);
      setOverlayVisible(false);
      scheduleFx(() => {
        if (gen !== overlayGen.current) return;
        setOverlayVisible(true);
      }, 16);
    },
    [clearFxTimers, scheduleFx],
  );

  const applyState = useCallback(
    (state: PresentationState) => {
      const epoch = state.epoch ?? 0;
      if (epoch <= latestEpoch.current) return;
      latestEpoch.current = epoch;

      const fade =
        typeof state.fade_ms === "number" && Number.isFinite(state.fade_ms)
          ? Math.max(0, state.fade_ms)
          : fadeMsRef.current;
      swapTo(state.public_url, fade);
      setOverlay(state.overlay_url ?? null);
    },
    [swapTo, setOverlay],
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
      clearBgTimers();
      clearFxTimers();
    };
  }, [applyState, clearBgTimers, clearFxTimers]);

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

  const bgTransition =
    layers.fadeMs > 0 ? `opacity ${layers.fadeMs}ms ease-in-out` : "none";
  const overlayTransition = `opacity ${OVERLAY_FADE_MS}ms ease-in-out`;

  const sizeUrl =
    layers.current.url || layers.previous.url || overlayUrl || null;
  const empty = !sizeUrl;

  return (
    <div
      className="relative flex h-dvh w-dvw items-center justify-center overflow-hidden bg-black text-white"
      onDoubleClick={() => void toggleFullscreen()}
      title="Duplo clique ou F para ecrã inteiro"
    >
      {sizeUrl ? (
        <div className="relative max-h-full max-w-full">
          {/* Fantasma: define o tamanho do frame (mesma resolução visual) */}
          <img
            src={sizeUrl}
            alt=""
            aria-hidden
            className="block max-h-dvh max-w-full object-contain opacity-0"
            draggable={false}
          />

          <div className="absolute inset-0">
            {layers.previous.url && (
              <img
                key={`prev-${layers.previous.key}`}
                src={layers.previous.url}
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
                draggable={false}
                style={{
                  opacity: layers.reveal ? 0 : 1,
                  transition: bgTransition,
                  zIndex: 1,
                }}
              />
            )}
            {layers.current.url && (
              <img
                key={`cur-${layers.current.key}`}
                src={layers.current.url}
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
                draggable={false}
                style={{
                  opacity: layers.reveal ? 1 : 0,
                  transition: bgTransition,
                  zIndex: 2,
                }}
              />
            )}
            {overlayUrl && (
              <img
                key={`fx-${overlayUrl}`}
                src={overlayUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
                draggable={false}
                style={{
                  opacity: overlayVisible ? 1 : 0,
                  transition: overlayTransition,
                  zIndex: 10,
                }}
              />
            )}
          </div>
        </div>
      ) : null}

      {empty && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/40">
          À espera de imagens… (F = ecrã inteiro)
        </p>
      )}
    </div>
  );
}
