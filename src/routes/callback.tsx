import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trocarCodigoPorToken } from "@/lib/spotify";

export const Route = createFileRoute("/callback")({
  head: () => ({
    meta: [
      { title: "A ligar ao Spotify — GM Co-Pilot" },
      { name: "description", content: "A concluir a ligação da tua conta Spotify ao GM Co-Pilot." },
      { property: "og:title", content: "A ligar ao Spotify — GM Co-Pilot" },
      {
        property: "og:description",
        content: "A concluir a ligação da tua conta Spotify ao GM Co-Pilot.",
      },
    ],
  }),
  component: CallbackPage,
});

function CallbackPage() {
  const navigate = useNavigate();
  const [mensagem, setMensagem] = useState("A ligar ao Spotify…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const erro = params.get("error");
    void (async () => {
      if (erro || !code) {
        toast.error("Ligação ao Spotify cancelada");
        void navigate({ to: "/audio" });
        return;
      }
      try {
        await trocarCodigoPorToken(code);
        toast.success("Spotify ligado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha a ligar o Spotify");
        setMensagem("Falhou. A voltar…");
      }
      void navigate({ to: "/audio" });
    })();
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      {mensagem}
    </div>
  );
}
