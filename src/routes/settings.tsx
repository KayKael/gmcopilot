import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/gm/TopBar";
import { SpotifyPanel } from "@/components/gm/SpotifyPanel";
import { SfxPanel } from "@/components/gm/SfxPanel";
import { MicPanel } from "@/components/gm/MicPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { SFX_KEYS, SFX_META, sceneIcon, type SceneConfig } from "@/lib/scenes";
import {
  carregarMoods,
  normalizarPlaylistUri,
  type MusicMood,
} from "@/lib/music-moods";
import { useSessionStore } from "@/store/session";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Definições de Cenas — GM Co-Pilot" },
      {
        name: "description",
        content:
          "Configura as 6 cenas do GM Co-Pilot: nome, cor, playlist de Spotify e efeitos sonoros sugeridos.",
      },
      { property: "og:title", content: "Definições de Cenas — GM Co-Pilot" },
      {
        property: "og:description",
        content: "Configura cores, playlists e efeitos sonoros de cada cena da tua sessão de RPG.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [rows, setRows] = useState<SceneConfig[]>([]);
  const [moodRows, setMoodRows] = useState<MusicMood[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMoods, setSavingMoods] = useState(false);
  const setScenes = useSessionStore((s) => s.setScenes);
  const setMoods = useSessionStore((s) => s.setMoods);

  useEffect(() => {
    void (async () => {
      const [{ data, error }, moods] = await Promise.all([
        supabase.from("scene_configs").select("*").order("ordem"),
        carregarMoods(),
      ]);
      if (error) toast.error("Não consegui carregar as cenas");
      else setRows((data ?? []) as unknown as SceneConfig[]);
      setMoodRows(moods);
      setMoods(moods);
      setLoading(false);
    })();
  }, [setMoods]);

  function patch(id: string, changes: Partial<SceneConfig>) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }

  function patchMood(key: string, changes: Partial<MusicMood>) {
    setMoodRows((r) => r.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  function toggleSfx(row: SceneConfig, sfx: string) {
    const has = row.sfx_sugeridos.includes(sfx);
    patch(row.id, {
      sfx_sugeridos: has
        ? row.sfx_sugeridos.filter((s) => s !== sfx)
        : [...row.sfx_sugeridos, sfx],
    });
  }

  async function guardar() {
    setSaving(true);
    const { error } = await supabase.from("scene_configs").upsert(
      rows.map((r) => ({
        id: r.id,
        key: r.key,
        nome: r.nome,
        cor: r.cor,
        icone: r.icone,
        spotify_playlist_uri: r.spotify_playlist_uri ?? "",
        sfx_sugeridos: r.sfx_sugeridos,
        ordem: r.ordem,
      })),
    );
    setSaving(false);
    if (error) toast.error("Falhou a gravação: " + error.message);
    else {
      setScenes(rows);
      toast.success("Cenas guardadas");
    }
  }

  async function guardarMoods() {
    setSavingMoods(true);
    const payload = moodRows.map((m) => ({
      ...(m.id ? { id: m.id } : {}),
      key: m.key,
      nome: m.nome,
      descricao: m.descricao,
      spotify_playlist_uri: normalizarPlaylistUri(m.spotify_playlist_uri),
      ordem: m.ordem,
      ativo: m.ativo ?? true,
    }));
    const { error } = await supabase.from("music_moods").upsert(payload, {
      onConflict: "key",
    });
    setSavingMoods(false);
    if (error) {
      toast.error(
        "Falhou a gravação dos moods: " +
          error.message +
          " (aplica a migration music_moods se a tabela ainda não existir)",
      );
      // Mesmo sem BD, actualiza o store local para a sessão actual
      const locais = moodRows.map((m) => ({
        ...m,
        spotify_playlist_uri: normalizarPlaylistUri(m.spotify_playlist_uri),
      }));
      setMoodRows(locais);
      setMoods(locais);
      return;
    }
    const refreshed = await carregarMoods();
    setMoodRows(refreshed);
    setMoods(refreshed);
    toast.success("Moods musicais guardados");
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Definições</h1>
              <p className="text-xs text-muted-foreground">
                Cenas (UI/SFX) e moods musicais (Mood DJ) são eixos separados.
              </p>
            </div>
            <Button onClick={() => void guardar()} disabled={saving || loading}>
              {saving ? "A guardar…" : "Guardar cenas"}
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Cenas (UI / SFX / atalhos 1–6)</h2>
              {rows.map((row) => {
                const Icon = sceneIcon(row.icone);
                return (
                  <section
                    key={row.id}
                    className="rounded-lg border border-border bg-panel p-4"
                    style={{ borderLeft: `3px solid ${row.cor}` }}
                  >
                    <div className="grid gap-3 md:grid-cols-[auto_1fr_auto]">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5" style={{ color: row.cor }} />
                        <span className="text-xs text-muted-foreground">{row.ordem}</span>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Nome</Label>
                        <Input
                          value={row.nome}
                          onChange={(e) => patch(row.id, { nome: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Cor</Label>
                        <input
                          type="color"
                          value={row.cor}
                          onChange={(e) => patch(row.id, { cor: e.target.value })}
                          className="h-9 w-16 cursor-pointer rounded border border-border bg-transparent"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <Label className="text-xs text-muted-foreground">Efeitos sugeridos</Label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {SFX_KEYS.map((sfx) => {
                          const active = row.sfx_sugeridos.includes(sfx);
                          return (
                            <button
                              key={sfx}
                              type="button"
                              onClick={() => toggleSfx(row, sfx)}
                              className="rounded-md border px-2 py-1 text-xs transition-colors"
                              style={
                                active
                                  ? { borderColor: row.cor, color: row.cor }
                                  : undefined
                              }
                            >
                              {SFX_META[sfx].nome}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Moods musicais</h2>
                <p className="text-xs text-muted-foreground">
                  Catálogo do Mood DJ. Aceita URI ou link open.spotify.com/playlist/…
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => void guardarMoods()}
                disabled={savingMoods || loading}
              >
                {savingMoods ? "A guardar…" : "Guardar moods"}
              </Button>
            </div>

            {!loading &&
              moodRows.map((m) => (
                <section key={m.key} className="rounded-lg border border-border bg-panel p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr]">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Nome</Label>
                      <Input
                        value={m.nome}
                        onChange={(e) => patchMood(m.key, { nome: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Key</Label>
                      <Input value={m.key} disabled className="opacity-70" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Playlist</Label>
                      <Input
                        value={m.spotify_playlist_uri}
                        placeholder="spotify:playlist:… ou https://open.spotify.com/playlist/…"
                        onChange={(e) =>
                          patchMood(m.key, { spotify_playlist_uri: e.target.value })
                        }
                        onBlur={(e) =>
                          patchMood(m.key, {
                            spotify_playlist_uri: normalizarPlaylistUri(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Descrição para a IA
                    </Label>
                    <Input
                      value={m.descricao}
                      onChange={(e) => patchMood(m.key, { descricao: e.target.value })}
                    />
                  </div>
                </section>
              ))}
          </div>

          <SpotifyPanel />
          <SfxPanel />
          <MicPanel />
        </div>
      </main>
    </div>
  );
}
