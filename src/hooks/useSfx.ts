import { useCallback, useEffect, useState } from "react";
import { precarregarSfx, tocarSfx } from "@/lib/sfx";
import { SFX_KEYS } from "@/lib/scenes";

const TECLAS = ["q", "w", "e", "r", "t", "y"];

export function useSfx() {
  const [aTocar, setATocar] = useState<string | null>(null);

  useEffect(() => {
    void precarregarSfx();
  }, []);

  const disparar = useCallback((key: string) => {
    tocarSfx(key);
    setATocar(key);
    setTimeout(() => setATocar((k) => (k === key ? null : k)), 400);
  }, []);

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
