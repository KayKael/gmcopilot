import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/gm/TopBar";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentação da Campanha — GM Co-Pilot" },
      {
        name: "description",
        content:
          "Carrega os documentos da tua campanha de RPG para poderes fazer perguntas durante a sessão.",
      },
      { property: "og:title", content: "Documentação da Campanha — GM Co-Pilot" },
      {
        property: "og:description",
        content: "Upload de notas e lore da campanha para pesquisa semântica durante o jogo.",
      },
    ],
  }),
  component: DocsPage,
});

function DocsPage() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-lg font-semibold">Documentação da campanha</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload de .md/.txt e indexação chegam na Fase 6.
          </p>
        </div>
      </main>
    </div>
  );
}
