import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/gm/TopBar";
import { Button } from "@/components/ui/button";
import {
  apagarAsset,
  isImageFile,
  listarAssets,
  uploadAssets,
  type VisualAsset,
} from "@/lib/visual-assets";
import {
  abrirJanelaApresentacao,
  carregarPresentation,
  definirFadeMs,
  limparEcran,
  apresentarAsset,
  preloadImage,
  preloadImages,
  readLocalPresentation,
  subscribePresentation,
  type PresentationState,
} from "@/lib/visual-presentation";
import {
  ExternalLink,
  ImageOff,
  Loader2,
  MonitorPlay,
  Trash2,
  Upload,
} from "lucide-react";

export const Route = createFileRoute("/visual")({
  head: () => ({
    meta: [
      { title: "Visual — GM Co-Pilot" },
      {
        name: "description",
        content: "Biblioteca de imagens e controlo do ecrã de apresentação para a sessão de RPG.",
      },
      { property: "og:title", content: "Visual — GM Co-Pilot" },
      {
        property: "og:description",
        content: "Upload rápido de imagens e apresentação com fade.",
      },
    ],
  }),
  component: VisualPage,
});

function VisualPage() {
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  // null no SSR e no 1.º paint do cliente — evita hydration mismatch com localStorage
  const [presentation, setPresentation] = useState<PresentationState | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const [aEnviar, setAEnviar] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fadeTimer = useRef<number | null>(null);

  const recarregar = useCallback(async () => {
    setACarregar(true);
    try {
      const [lista, estado] = await Promise.all([listarAssets(), carregarPresentation()]);
      setAssets(lista);
      setPresentation(estado);
      preloadImages(lista.map((a) => a.public_url));
    } catch (e) {
      console.error(e);
      toast.error("Não consegui carregar a biblioteca visual");
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    // Hidratação segura: localStorage só depois do mount
    const local = readLocalPresentation();
    if (local) setPresentation(local);
    void recarregar();
  }, [recarregar]);

  useEffect(() => {
    return subscribePresentation(setPresentation);
  }, []);

  async function processar(ficheiros: FileList | File[] | null) {
    if (!ficheiros || (Array.isArray(ficheiros) ? ficheiros.length === 0 : ficheiros.length === 0)) {
      return;
    }
    const list = Array.from(ficheiros as FileList);
    const validos = list.filter(isImageFile);
    for (const f of list) {
      if (!isImageFile(f)) toast.error(`${f.name}: só aceito imagens`);
    }
    if (validos.length === 0) return;

    for (const f of validos) {
      setAEnviar(f.name);
      try {
        const uploaded = await uploadAssets([f]);
        setAssets((prev) => [...prev, ...uploaded]);
        preloadImages(uploaded.map((a) => a.public_url));
        toast.success(`${f.name} carregado`);
      } catch (e) {
        console.error(e);
        toast.error(`Falhei a carregar ${f.name}`);
      }
    }
    setAEnviar(null);
  }

  function onApresentar(asset: VisualAsset) {
    try {
      // Só publica a imagem ativa — a janela /apresentar já aberta atualiza em tempo real.
      const estado = apresentarAsset(asset, presentation?.fade_ms ?? 200);
      setPresentation(estado);
    } catch (e) {
      console.error(e);
      toast.error("Não consegui apresentar a imagem");
    }
  }

  function onLimpar() {
    try {
      const estado = limparEcran(presentation?.fade_ms ?? 200);
      setPresentation(estado);
    } catch (e) {
      console.error(e);
      toast.error("Não consegui limpar o ecrã");
    }
  }

  function onFade(v: number) {
    setPresentation((p) =>
      p
        ? { ...p, fade_ms: v }
        : {
            active_asset_id: null,
            public_url: null,
            nome: null,
            fade_ms: v,
            updated_at: new Date().toISOString(),
            epoch: 0,
          },
    );
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => {
      try {
        setPresentation(definirFadeMs(v));
      } catch (e) {
        console.error(e);
        toast.error("Não consegui guardar o fade");
      }
    }, 200);
  }

  async function onApagar(asset: VisualAsset) {
    try {
      const eraAtivo = presentation?.active_asset_id === asset.id;
      await apagarAsset(asset);
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      if (selectedId === asset.id) setSelectedId(null);
      if (eraAtivo) {
        const estado = limparEcran(presentation?.fade_ms ?? 200);
        setPresentation(estado);
      }
      toast.success("Imagem apagada");
    } catch (e) {
      console.error(e);
      toast.error("Não consegui apagar a imagem");
    }
  }

  const selecionada = assets.find((a) => a.id === selectedId) ?? null;
  const emEcran =
    assets.find((a) => a.id === presentation?.active_asset_id) ?? null;
  const fade = presentation?.fade_ms ?? 200;

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_320px]">
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h1 className="text-lg font-semibold">Biblioteca visual</h1>
                <p className="text-sm text-muted-foreground">
                  Arrasta imagens para carregar e apresenta no ecrã dos jogadores.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Carregar
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                multiple
                className="hidden"
                onChange={(e) => {
                  void processar(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void processar(e.dataTransfer.files);
              }}
              className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border bg-panel"
              }`}
            >
              <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Arrasta imagens para aqui (jpg, png, webp, gif, avif)
              </p>
              {aEnviar && (
                <p className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> A enviar {aEnviar}…
                </p>
              )}
            </div>

            {aCarregar && assets.length === 0 ? (
              <p className="text-sm text-muted-foreground">A carregar…</p>
            ) : assets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não há imagens.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {assets.map((asset) => {
                  const selected = asset.id === selectedId;
                  const onScreen = asset.id === presentation?.active_asset_id;
                  return (
                    <div
                      key={asset.id}
                      className={`group relative overflow-hidden rounded-lg border bg-panel ${
                        selected
                          ? "border-primary ring-1 ring-primary/40"
                          : onScreen
                            ? "border-ok/60"
                            : "border-border"
                      }`}
                      onMouseEnter={() => void preloadImage(asset.public_url)}
                      onFocus={() => void preloadImage(asset.public_url)}
                    >
                      <button
                        type="button"
                        className="block w-full text-left"
                        onClick={() => setSelectedId(asset.id)}
                        title="Selecionar"
                      >
                        <div className="aspect-video bg-secondary/40">
                          <img
                            src={asset.public_url}
                            alt={asset.nome}
                            className="h-full w-full object-cover"
                            loading="eager"
                            decoding="async"
                          />
                        </div>
                        <p className="truncate px-2 py-1.5 text-xs">{asset.nome}</p>
                      </button>
                      {onScreen && (
                        <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                          Em ecrã
                        </span>
                      )}
                      <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7"
                          title="Apagar"
                          onClick={() => void onApagar(asset)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="space-y-3">
            <section className="rounded-lg border border-border bg-panel p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Em ecrã
              </h2>
              <div className="mt-2 aspect-video overflow-hidden rounded-md border border-border bg-black">
                {emEcran?.public_url || presentation?.public_url ? (
                  <img
                    src={emEcran?.public_url ?? presentation?.public_url ?? ""}
                    alt={emEcran?.nome ?? presentation?.nome ?? "Em ecrã"}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ImageOff className="h-6 w-6" />
                    <span className="text-xs">Ecrã limpo</span>
                  </div>
                )}
              </div>
              <p className="mt-2 truncate text-sm">
                {emEcran?.nome ?? presentation?.nome ?? "Nada a apresentar"}
              </p>
              {selecionada && (
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  Selecionada: {selecionada.nome}
                </p>
              )}

              <label className="mt-3 block text-xs text-muted-foreground">
                Fade: {fade} ms{fade === 0 ? " (corte)" : ""}
                <input
                  type="range"
                  min={0}
                  max={1500}
                  step={50}
                  value={fade}
                  onChange={(e) => onFade(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full accent-primary"
                />
              </label>

              <div className="mt-3 flex flex-col gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!selecionada) {
                      toast.message("Seleciona uma imagem na biblioteca");
                      return;
                    }
                    onApresentar(selecionada);
                  }}
                  disabled={!selecionada}
                >
                  <MonitorPlay className="h-4 w-4" /> Apresentar
                </Button>
                <Button size="sm" variant="outline" onClick={abrirJanelaApresentacao}>
                  <ExternalLink className="h-4 w-4" /> Abrir apresentação
                </Button>
                <Button size="sm" variant="ghost" onClick={onLimpar}>
                  <ImageOff className="h-4 w-4" /> Limpar ecrã
                </Button>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-panel p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Próximas features
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Espaço reservado para mapas, overlays e outras ajudas visuais de RPG.
              </p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
