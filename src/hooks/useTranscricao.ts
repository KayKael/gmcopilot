import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { iniciarGravador, type Gravador } from "@/lib/audio-recorder";
import { transcreverBloco } from "@/lib/transcricao.functions";
import { resumirSessao } from "@/lib/sessao.functions";
import { useSessionStore } from "@/store/session";

export function useTranscricao() {
  const transcrever = useServerFn(transcreverBloco);
  const gerarResumo = useServerFn(resumirSessao);
  const gravadorRef = useRef<Gravador | null>(null);
  const sidRef = useRef<string | null>(null);
  const falhasRef = useRef(0);

  const status = useSessionStore((s) => s.status);
  const setStatus = useSessionStore((s) => s.setStatus);
  const sessionId = useSessionStore((s) => s.sessionId);
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const addLinha = useSessionStore((s) => s.addLinha);
  const setParcial = useSessionStore((s) => s.setParcial);
  const limparTranscricao = useSessionStore((s) => s.limparTranscricao);
  const micMudo = useSessionStore((s) => s.micMudo);
  const setMicMudo = useSessionStore((s) => s.setMicMudo);

  const guardarLinha = useCallback(
    async (texto: string, sid: string | null) => {
      const linha = { id: crypto.randomUUID(), ts: new Date().toISOString(), texto };
      addLinha(linha);
      const { error } = await supabase
        .from("transcript_lines")
        .insert({ id: linha.id, session_id: sid, texto, ts: linha.ts });
      if (error) console.error("Não consegui guardar a linha:", error.message);
    },
    [addLinha],
  );

  const parar = useCallback(async () => {
    try {
      gravadorRef.current?.parar();
    } catch {
      /* ignorar */
    }
    gravadorRef.current = null;
    setParcial("");
    setStatus("parada");
    const sid = sidRef.current ?? sessionId;
    if (sid) {
      await supabase
        .from("sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sid);
      try {
        const r = await gerarResumo({ data: { id: sid } });
        if (r?.vazio) toast.info("Sessão terminada sem transcrição — sem resumo");
        else toast.success("Resumo da sessão gerado");
      } catch (e) {
        console.error(e);
        toast.error(e instanceof Error ? e.message : "Não consegui gerar o resumo da sessão");
      }
    }
  }, [gerarResumo, sessionId, setParcial, setStatus]);

  const iniciar = useCallback(async () => {
    if (gravadorRef.current) return;
    falhasRef.current = 0;
    setStatus("reconectando");
    limparTranscricao();
    try {
      const { data: sess, error } = await supabase
        .from("sessions")
        .insert({ nome: `Sessão de ${new Date().toLocaleDateString("pt-PT")}` })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const sid = sess.id as string;
      sidRef.current = sid;
      setSessionId(sid);

      gravadorRef.current = await iniciarGravador({
        intervaloMs: 6000,
        onBloco: (wavBase64) => {
          setParcial("a transcrever…");
          void (async () => {
            try {
              const { texto } = await transcrever({ data: { wavBase64 } });
              falhasRef.current = 0;
              setParcial("");
              const limpo = texto.trim();
              if (limpo) await guardarLinha(limpo, sid);
            } catch (e) {
              console.error(e);
              setParcial("");
              falhasRef.current += 1;
              if (falhasRef.current === 3) toast.error("Falhas na transcrição — a continuar a tentar");
            }
          })();
        },
        onErro: (e) => console.error(e),
      });
      setMicMudo(false);
      setStatus("ativa");
    } catch (e) {
      console.error(e);
      setStatus("parada");
      toast.error(
        e instanceof DOMException
          ? "Sem acesso ao microfone"
          : e instanceof Error
            ? e.message
            : "Não consegui iniciar a transcrição",
      );
    }
  }, [guardarLinha, limparTranscricao, setMicMudo, setParcial, setSessionId, setStatus, transcrever]);

  const alternarMic = useCallback(() => {
    if (!gravadorRef.current) return;
    const novo = !micMudo;
    gravadorRef.current.setMudo(novo);
    setMicMudo(novo);
  }, [micMudo, setMicMudo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key.toLowerCase() === "m") alternarMic();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alternarMic]);

  useEffect(
    () => () => {
      try {
        gravadorRef.current?.parar();
      } catch {
        /* ignorar */
      }
    },
    [],
  );

  return { status, iniciar, parar, alternarMic, micMudo };
}
