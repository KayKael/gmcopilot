import { useCallback, useEffect, useState } from "react";
import { precarregarSfx, tocarSfx } from "@/lib/sfx";
import { definirVolume } from "@/lib/spotify";
import { SFX_KEYS } from "@/lib/scenes";
import { useSessionStore } from "@/store/session";

const TECLAS = ["q", "w", "e", "r", "t", "y"];
const VOL_MUSICA_KEY = "gmcp.spotify.volume";

function volumeMusica() {
  if (typeof window === "undefined") return 80;
  const v = Number(localStorage.getItem(VOL_MUSICA_KEY));
  return Number.isFinite(v) && v > 0 ? v : 80;
}

export function useSfx() {
  const spotifyStatus = useSessionStore((s) => s.spotifyStatus);
  const [aTocar, setATocar] = useState<string | null>(null);

  useEffect(() => {
    void precarregarSfx();
  }, []);

  const disparar = useCallback(
    (key: string) => {
      const duracao = tocarSfx(key);
      setATocar(key);
      setTimeout(() => setATocar((k) => (k === key ? null : k)), 400);
      if (duracao && spotifyStatus === "ligado") {
        const base = volumeMusica();
        void definirVolume(Math.round(base * 0.4));
        setTimeout(() => void definirVolume(base), Math.min(duracao * 1000, 8000));
      }
    },
    [spotifyStatus],
  );

  // Atalhos Q W E R T Y para os 6 primeiros sons
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const i = TECLAS.indexOf(e.key.toLowerCase());
      if (i >= 0 && SFX_KEYS[i]) disparar(SFX_KEYS[i]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disparar]);

  return { disparar, aTocar };
}
