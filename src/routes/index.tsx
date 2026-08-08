import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/gm/TopBar";
import { AudioWaveform, ImageIcon } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GM Co-Pilot — Assistente de Mestre de RPG" },
      {
        name: "description",
        content:
          "Escolhe o painel de áudio ou o painel visual para conduzir a sessão de RPG.",
      },
      { property: "og:title", content: "GM Co-Pilot — Assistente de Mestre de RPG" },
      {
        property: "og:description",
        content: "Dashboards de áudio e visual para mestres de RPG.",
      },
    ],
  }),
  component: HubPage,
});

function HubPage() {
  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <main className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          <Link
            to="/audio"
            className="group flex flex-col gap-3 rounded-xl border border-border bg-panel p-6 transition-colors hover:border-primary/50 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AudioWaveform className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Áudio</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Transcrição, cena, Spotify e efeitos sonoros.
              </p>
            </div>
            <span className="mt-auto text-xs text-muted-foreground group-hover:text-foreground">
              Abrir painel →
            </span>
          </Link>
          <Link
            to="/visual"
            className="group flex flex-col gap-3 rounded-xl border border-border bg-panel p-6 transition-colors hover:border-primary/50 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ImageIcon className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Visual</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Imagens, fades e ecrã de apresentação.
              </p>
            </div>
            <span className="mt-auto text-xs text-muted-foreground group-hover:text-foreground">
              Abrir painel →
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
