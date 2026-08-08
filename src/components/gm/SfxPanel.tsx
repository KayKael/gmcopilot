import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  definirModoLoopSfx,
  definirVolumeSfx,
  obterModoLoopSfx,
  obterVolumeSfx,
  onSfxLoopChange,
  tocarSfx,
} from "@/lib/sfx";
import { SFX_META } from "@/lib/scenes";
import { efeitosDoPack, resolverPackAtivo } from "@/lib/sfx-packs";
import { useSessionStore } from "@/store/session";

export function SfxPanel() {
  const [volume, setVolume] = useState(0.8);
  const [modoLoop, setModoLoop] = useState(false);
  const [emLoop, setEmLoop] = useState<string[]>([]);
  const sfxPacks = useSessionStore((s) => s.sfxPacks);
  const sfxPackAtivo = useSessionStore((s) => s.sfxPackAtivo);

  const pack = useMemo(
    () => resolverPackAtivo(sfxPacks, sfxPackAtivo),
    [sfxPacks, sfxPackAtivo],
  );
  const efeitos = useMemo(() => efeitosDoPack(pack), [pack]);

  useEffect(() => {
    setVolume(obterVolumeSfx());
    setModoLoop(obterModoLoopSfx());
  }, []);

  useEffect(() => onSfxLoopChange(setEmLoop), []);

  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <h2 className="text-sm font-semibold">Efeitos sonoros</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Volume e teste do pack activo ({pack.nome}). Com loop, um segundo clique pára a
        repetição.
      </p>

      <div className="mt-4">
        <Label className="text-xs text-muted-foreground">
          Volume ({Math.round(volume * 100)}%)
        </Label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            setVolume(v);
            definirVolumeSfx(v);
          }}
          className="mt-1.5 w-full accent-primary"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="sfx-loop" className="text-xs">
            Loop dos efeitos
          </Label>
          <p className="text-[11px] text-muted-foreground">Repetir enquanto activo</p>
        </div>
        <Switch
          id="sfx-loop"
          checked={modoLoop}
          onCheckedChange={(on) => {
            setModoLoop(on);
            definirModoLoopSfx(on);
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {efeitos.map((sfx) => {
          const activo = emLoop.includes(sfx);
          const meta = SFX_META[sfx];
          return (
            <Button
              key={sfx}
              size="sm"
              variant={activo ? "default" : "outline"}
              onClick={() => tocarSfx(sfx, { loop: modoLoop })}
            >
              {meta?.nome ?? sfx}
              {activo ? " · ∞" : ""}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
