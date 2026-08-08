import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/gm/TopBar";
import { VoiceFxPanel } from "@/components/gm/VoiceFxPanel";

export const Route = createFileRoute("/voz")({
  head: () => ({
    meta: [
      { title: "Alteração de voz — GM Co-Pilot" },
      {
        name: "description",
        content:
          "Sessão de alteração de voz em tempo real: perfis como Etsai, monitor e personalização ao vivo.",
      },
      { property: "og:title", content: "Alteração de voz — GM Co-Pilot" },
      {
        property: "og:description",
        content: "Voz grossa e demoníaca para NPCs — Etsai e outros perfis no browser.",
      },
    ],
  }),
  component: VozPage,
});

function VozPage() {
  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 px-3 pt-3 lg:px-3">
            <h1 className="text-lg font-semibold tracking-tight">Alteração de voz</h1>
            <p className="text-xs text-muted-foreground">
              Perfis prontos · ouvir o retorno · ajustar o efeito ao vivo
            </p>
          </div>
          <div className="min-h-0 flex-1">
            <VoiceFxPanel />
          </div>
        </div>
      </main>
    </div>
  );
}
