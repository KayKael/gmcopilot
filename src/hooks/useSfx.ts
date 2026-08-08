import { useCallback, useEffect, useMemo, useState } from "react";
import {
  definirModoLoopSfx,
  obterModoLoopSfx,
  onSfxLoopChange,
  pararTodosSfx,
  pararTodosSfxEmLoop,
  precarregarSfx,
  tocarSfx,
} from "@/lib/sfx";
import {
  efeitosDoPack,
  packByKey,
  resolverPackAtivo,
} from "@/lib/sfx-packs";
import { useSessionStore } from "@/store/session";

const TECLAS = ["q", "w", "e", "r", "t", "y"];

export function useSfx() {
  const sfxPacks = useSessionStore((s) => s.sfxPacks);
  const sfxPackAtivo = useSessionStore((s) => s.sfxPackAtivo);
  const setSfxPackAtivo = useSessionStore((s) => s.setSfxPackAtivo);

  const [aTocar, setATocar] = useState<string | null>(null);
  const [modoLoop, setModoLoop] = useState(false);
  const [emLoop, setEmLoop] = useState<string[]>([]);

  const pack = useMemo(
    () => resolverPackAtivo(sfxPacks, sfxPackAtivo),
    [sfxPacks, sfxPackAtivo],
  );
  const efeitos = useMemo(() => efeitosDoPack(pack), [pack]);

  useEffect(() => {
    void precarregarSfx();
    setModoLoop(obterModoLoopSfx());
  }, []);

  useEffect(() => onSfxLoopChange(setEmLoop), []);

  // Ao mudar de pack, pára loops
  useEffect(() => {
    pararTodosSfxEmLoop();
  }, [pack.key]);

  const definirLoop = useCallback((on: boolean) => {
    setModoLoop(on);
    definirModoLoopSfx(on);
    if (!on) pararTodosSfxEmLoop();
  }, []);

  const escolherPack = useCallback(
    (key: string) => {
      pararTodosSfxEmLoop();
      setSfxPackAtivo(key);
    },
    [setSfxPackAtivo],
  );

  const disparar = useCallback((key: string) => {
    const looping = obterModoLoopSfx();
    tocarSfx(key, { loop: looping });
    if (looping) return;
    setATocar(key);
    setTimeout(() => setATocar((k) => (k === key ? null : k)), 400);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))
        return;
      const i = TECLAS.indexOf(e.key.toLowerCase());
      if (i >= 0 && efeitos[i]) disparar(efeitos[i]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disparar, efeitos]);

  const pararTudo = useCallback(() => {
    pararTodosSfx();
    setATocar(null);
  }, []);

  const packsActivos = useMemo(
    () => sfxPacks.filter((p) => p.ativo !== false),
    [sfxPacks],
  );

  return {
    disparar,
    pararTudo,
    aTocar,
    modoLoop,
    definirLoop,
    emLoop,
    efeitos,
    pack,
    packsActivos,
    escolherPack,
    packExiste: Boolean(packByKey(sfxPacks, sfxPackAtivo)),
  };
}
