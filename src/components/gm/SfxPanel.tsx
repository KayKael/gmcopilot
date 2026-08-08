import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { definirVolumeSfx, obterVolumeSfx, tocarSfx } from "@/lib/sfx";
import { SFX_KEYS, SFX_META } from "@/lib/scenes";

export function SfxPanel() {
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    setVolume(obterVolumeSfx());
  }, []);

  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <h2 className="text-sm font-semibold">Efeitos sonoros</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Volume dos efeitos e teste rápido de cada som. A música baixa automaticamente enquanto um
        efeito toca.
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

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SFX_KEYS.map((sfx) => (
          <Button key={sfx} size="sm" variant="outline" onClick={() => tocarSfx(sfx)}>
            {SFX_META[sfx].nome}
          </Button>
        ))}
      </div>
    </section>
  );
}
