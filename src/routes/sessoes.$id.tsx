import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { TopBar } from "@/components/gm/TopBar";
import { Button } from "@/components/ui/button";
import { obterSessao, resumirSessao } from "@/lib/sessao.functions";
import { ArrowLeft, Download, Loader2 } from "lucide-react";

export const Route = createFileRoute("/sessoes/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe da Sessão — GM Co-Pilot" },
      {
        name: "description",
        content: "Resumo, transcrição completa e linha do tempo de cenas de uma sessão de RPG.",
      },
      { property: "og:title", content: "Detalhe da Sessão — GM Co-Pilot" },
      {
        property: "og:description",
        content: "Consulta e exporta o resumo e a transcrição de uma sessão de jogo.",
      },
    ],
  }),
  component: SessaoPage,
});

interface Dados {
  sessao: { id: string; nome: string | null; started_at: string; resumo: string | null };
  linhas: { id: string; ts: string; texto: string }[];
  eventos: { id: string; ts: string; cena: string; origem: string; confianca: number | null }[];
}

function SessaoPage() {
  const { id } = Route.useParams();
  const obter = useServerFn(obterSessao);
  const resumir = useServerFn(resumirSessao);
  const [dados, setDados] = useState<Dados | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtro, setFiltro] = useState("");

  const carregar = useCallback(async () => {
    try {
      setDados((await obter({ data: { id } })) as Dados);
    } catch (e) {
      console.error(e);
      toast.error("Não consegui carregar a sessão");
    }
  }, [id, obter]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function exportar() {
    if (!dados) return;
    const md = [
      `# ${dados.sessao.nome ?? "Sessão"}`,
      `_${new Date(dados.sessao.started_at).toLocaleString("pt-PT")}_`,
      "",
      dados.sessao.resumo ?? "_Sem resumo._",
      "",
      "## Transcrição",
      ...dados.linhas.map(
        (l) => `- **${new Date(l.ts).toLocaleTimeString("pt-PT")}** ${l.texto}`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sessao-${id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const linhas = dados?.linhas.filter((l) =>
    l.texto.toLowerCase().includes(filtro.toLowerCase()),
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link to="/sessoes">
                <ArrowLeft className="h-4 w-4" /> Sessões
              </Link>
            </Button>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={ocupado || !dados?.linhas.length}
                onClick={() => {
                  void (async () => {
                    setOcupado(true);
                    try {
                      await resumir({ data: { id } });
                      await carregar();
                    } catch {
                      toast.error("Não consegui gerar o resumo");
                    } finally {
                      setOcupado(false);
                    }
                  })();
                }}
              >
                {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Gerar resumo
              </Button>
              <Button size="sm" variant="outline" onClick={exportar}>
                <Download className="h-4 w-4" /> Exportar
              </Button>
            </div>
          </div>

          {!dados ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : (
            <>
              <h1 className="text-lg font-semibold">
                {dados.sessao.nome ?? new Date(dados.sessao.started_at).toLocaleString("pt-PT")}
              </h1>

              <section className="rounded-lg border border-border bg-panel p-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Resumo
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {dados.sessao.resumo ?? "Ainda não há resumo para esta sessão."}
                </p>
              </section>

              {dados.eventos.length > 0 && (
                <section className="rounded-lg border border-border bg-panel p-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Linha do tempo de cenas
                  </h2>
                  <ul className="mt-2 space-y-1 text-sm">
                    {dados.eventos.map((ev) => (
                      <li key={ev.id} className="flex gap-3">
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.ts).toLocaleTimeString("pt-PT")}
                        </span>
                        <span>
                          {ev.cena}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({ev.origem}
                            {ev.confianca != null
                              ? ` · ${(ev.confianca * 100).toFixed(0)}%`
                              : ""}
                            )
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="rounded-lg border border-border bg-panel p-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Transcrição
                  </h2>
                  <input
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    placeholder="Pesquisar…"
                    className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                  />
                </div>
                <div className="mt-2 space-y-1 font-mono text-sm">
                  {linhas?.map((l) => (
                    <p key={l.id} className="flex gap-3">
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(l.ts).toLocaleTimeString("pt-PT")}
                      </span>
                      <span>{l.texto}</span>
                    </p>
                  ))}
                  {linhas?.length === 0 && (
                    <p className="text-sm text-muted-foreground">Sem resultados.</p>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
