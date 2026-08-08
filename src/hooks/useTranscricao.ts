import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { iniciarGravador, type GravadorAudio } from "@/lib/audio-recorder";
import { transcreverBloco } from "@/lib/transcricao.functions";
import { resumirSessao } from "@/lib/sessao.functions";
import { useSessionStore } from "@/store/session";

export function useTranscricao() {
  const transcrever = useServerFn(transcreverBloco);
  const gerarResumo = useServerFn(resumirSessao);
  const gravadorRef = useRef<GravadorAudio | null>(null);
  const filaRef = useRef<Promise<void>>(Promise.resolve());
  const falhasRef = useRef(0);
  const aPararRef = useRef(false);
  const sidRef = useRef<string | null>(null);

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
      const linha = {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        texto,
      };
      addLinha(linha);
      const { error } = await supabase
        .from("transcript_lines")
        .insert({ id: linha.id, session_id: sid, texto, ts: linha.ts });
      if (error) console.error("Não consegui guardar a linha:", error.message);
    },
    [addLinha],
  );

  const ligarGravador = useCallback(
    async (sid: string) => {
      gravadorRef.current = await iniciarGravador({
        intervaloMs: 6000,
        onBloco: (wavBase64) => {
          setParcial("a transcrever…");
          filaRef.current = filaRef.current.then(async () => {
            try {
              const { texto } = await transcrever({ data: { wavBase64 } });
              falhasRef.current = 0;
              const limpo = texto.trim();
              if (limpo) await guardarLinha(limpo, sid);
            } catch (erro) {
              console.error(erro);
              falhasRef.current += 1;
              if (falhasRef.current === 1) toast.error("Falha ao transcrever áudio — vou continuar a tentar");
            } finally {
              setParcial("");
            }
          });
        },
        onErro: (erro) => console.error("Erro ao preparar áudio:", erro),
      });
      falhasRef.current = 0;
      setMicMudo(false);
      setStatus("ativa");
    },
    [guardarLinha, setMicMudo, setParcial, setStatus, transcrever],
  );

  const ligarRef = useRef(ligarGravador);
  ligarRef.current = ligarGravador;

  const parar = useCallback(async () => {
    aPararRef.current = true;
    try {
      await gravadorRef.current?.parar();
      await filaRef.current;
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
        toast.error(
          e instanceof Error ? e.message : "Não consegui gerar o resumo da sessão",
        );
      }
    }
  }, [gerarResumo, sessionId, setParcial, setStatus]);

  const iniciar = useCallback(async () => {
    if (gravadorRef.current) return;
    aPararRef.current = false;
    filaRef.current = Promise.resolve();
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
      await ligarRef.current(sid);
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
  }, [limparTranscricao, setSessionId, setStatus]);

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
      aPararRef.current = true;
      void gravadorRef.current?.parar();
    },
    [],
  );

  return { status, iniciar, parar, alternarMic, micMudo };
}
