import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SFX_KEYS, SFX_META } from "@/lib/scenes";
import {
  carregarPacks,
  slugPackKey,
  type SfxPack,
} from "@/lib/sfx-packs";
import { supabase } from "@/integrations/supabase/client";
import { useSessionStore } from "@/store/session";

export function SfxPacksPanel() {
  const [packs, setPacks] = useState<SfxPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const setSfxPacks = useSessionStore((s) => s.setSfxPacks);
  const sfxPackAtivo = useSessionStore((s) => s.sfxPackAtivo);
  const setSfxPackAtivo = useSessionStore((s) => s.setSfxPackAtivo);

  async function refresh() {
    const data = await carregarPacks({ soActivos: false });
    setPacks(data);
    setSfxPacks(data.filter((p) => p.ativo !== false));
    if (sfxPackAtivo && !data.some((p) => p.key === sfxPackAtivo && p.ativo !== false)) {
      const first = data.find((p) => p.ativo !== false);
      if (first) setSfxPackAtivo(first.key);
    }
  }

  useEffect(() => {
    void (async () => {
      await refresh();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(key: string, changes: Partial<SfxPack>) {
    setPacks((rows) => rows.map((p) => (p.key === key ? { ...p, ...changes } : p)));
  }

  function toggleEfeito(pack: SfxPack, sfx: string) {
    const has = pack.efeitos.includes(sfx);
    patch(pack.key, {
      efeitos: has ? pack.efeitos.filter((e) => e !== sfx) : [...pack.efeitos, sfx],
    });
  }

  async function guardar() {
    setSaving(true);
    const payload = packs.map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      key: p.key,
      nome: p.nome,
      efeitos: p.efeitos,
      built_in: p.built_in ?? false,
      ativo: p.ativo ?? true,
      ordem: p.ordem,
    }));
    const { error } = await supabase.from("sfx_packs").upsert(payload, {
      onConflict: "key",
    });
    setSaving(false);
    if (error) {
      toast.error(
        "Falhou a gravação dos packs: " +
          error.message +
          " (aplica a migration sfx_packs se a tabela ainda não existir)",
      );
      setSfxPacks(packs.filter((p) => p.ativo !== false));
      return;
    }
    await refresh();
    toast.success("Packs de efeitos guardados");
  }

  async function criarPack() {
    const nome = novoNome.trim();
    if (!nome) {
      toast.error("Indica um nome para o pack");
      return;
    }
    let key = slugPackKey(nome);
    const existing = new Set(packs.map((p) => p.key));
    if (existing.has(key)) key = `${key}_${Date.now().toString(36).slice(-4)}`;
    const ordem = packs.reduce((m, p) => Math.max(m, p.ordem), 0) + 1;
    const novo: SfxPack = {
      key,
      nome,
      efeitos: [...SFX_KEYS],
      built_in: false,
      ativo: true,
      ordem,
    };
    const { error } = await supabase.from("sfx_packs").insert({
      key: novo.key,
      nome: novo.nome,
      efeitos: novo.efeitos,
      built_in: false,
      ativo: true,
      ordem: novo.ordem,
    });
    if (error) {
      // Offline / sem tabela: fica só local até migrar
      setPacks((p) => [...p, novo]);
      setSfxPacks([...packs.filter((x) => x.ativo !== false), novo]);
      toast.message("Pack criado localmente (gravação BD falhou: " + error.message + ")");
    } else {
      await refresh();
      toast.success(`Pack “${nome}” criado`);
    }
    setNovoNome("");
  }

  async function apagarPack(pack: SfxPack) {
    if (pack.built_in) {
      toast.error("Packs built-in não podem ser apagados");
      return;
    }
    if (pack.id) {
      const { error } = await supabase.from("sfx_packs").delete().eq("id", pack.id);
      if (error) {
        toast.error("Não consegui apagar: " + error.message);
        return;
      }
    }
    const next = packs.filter((p) => p.key !== pack.key);
    setPacks(next);
    setSfxPacks(next.filter((p) => p.ativo !== false));
    if (sfxPackAtivo === pack.key) {
      const first = next.find((p) => p.ativo !== false);
      if (first) setSfxPackAtivo(first.key);
    }
    toast.success(`Pack “${pack.nome}” apagado`);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Packs de efeitos</h2>
          <p className="text-xs text-muted-foreground">
            Perfis (DnD, Ordem Paranormal, custom). No dashboard escolhes qual está activo.
          </p>
        </div>
        <Button variant="outline" onClick={() => void guardar()} disabled={saving || loading}>
          {saving ? "A guardar…" : "Guardar packs"}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-panel p-3">
        <div className="min-w-[200px] flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">Novo pack</Label>
          <Input
            value={novoNome}
            placeholder="ex.: Cyberpunk, Call of Cthulhu…"
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void criarPack();
            }}
          />
        </div>
        <Button onClick={() => void criarPack()} disabled={loading}>
          Criar
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar packs…</p>
      ) : (
        packs.map((pack) => (
          <section key={pack.key} className="rounded-lg border border-border bg-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[1fr_1fr]">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nome</Label>
                  <Input
                    value={pack.nome}
                    onChange={(e) => patch(pack.key, { nome: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Key</Label>
                  <Input value={pack.key} disabled className="opacity-70" />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-5">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={pack.ativo !== false}
                    onCheckedChange={(on) => patch(pack.key, { ativo: on })}
                  />
                  Activo
                </label>
                {!pack.built_in && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => void apagarPack(pack)}
                  >
                    Apagar
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-3">
              <Label className="text-xs text-muted-foreground">
                Efeitos do catálogo
                {pack.built_in ? " · built-in" : ""}
              </Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SFX_KEYS.map((sfx) => {
                  const active = pack.efeitos.includes(sfx);
                  return (
                    <button
                      key={sfx}
                      type="button"
                      onClick={() => toggleEfeito(pack, sfx)}
                      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                        active
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {SFX_META[sfx].nome}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ))
      )}
    </section>
  );
}
