import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { criarTokenTranscricao } from "@/lib/realtime.functions";
import { resumirSessao } from "@/lib/sessao.functions";
import {
  actualizarCallbacksTranscricao,
  definirSessionIdActivo,
  ligarTranscricaoRuntime,
  marcarPararTranscricao,
  obterSessaoTranscricao,
  obterSessionIdActivo,
  pararTranscricaoRuntime,
  setMudoRuntime,
} from "@/lib/transcricao-runtime";
import { useSessionStore } from "@/store/session";

const MAX_RETRIES = 3;

export function useTranscricao() {
  const pedirToken = useServerFn(criarTokenTranscricao);
  const gerarResumo = useServerFn(resumirSessao);
  const retriesRef = useRef(0);
  const aReconectarRef = useRef(false);

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

  const ligarWebRTC = useCallback(async () => {
    marcarPararTranscricao(false);
    const { token } = await pedirToken({ data: undefined });
    await ligarTranscricaoRuntime(token);
    setMicMudo(false);
  }, [pedirToken, setMicMudo]);

  const ligarRef = useRef(ligarWebRTC);
  ligarRef.current = ligarWebRTC;

  const reconectar = useCallback(async () => {
    if (aReconectarRef.current) return;
    const sid = obterSessionIdActivo();
    if (!sid) {
      setStatus("parada");
      return;
    }

    aReconectarRef.current = true;
    pararTranscricaoRuntime();
    marcarPararTranscricao(false);

    if (retriesRef.current >= MAX_RETRIES) {
      setStatus("parada");
      aReconectarRef.current = false;
      toast.error("Ligação de transcrição perdida (sem mais tentativas)");
      return;
    }

    retriesRef.current += 1;
    setStatus("reconectando");
    toast.message(`A reconectar transcrição (${retriesRef.current}/${MAX_RETRIES})…`);

    try {
      await ligarRef.current();
      aReconectarRef.current = false;
    } catch (e) {
      console.error(e);
      aReconectarRef.current = false;
      if (retriesRef.current >= MAX_RETRIES) {
        setStatus("parada");
        toast.error("Não consegui reestabelecer a transcrição");
      } else {
        window.setTimeout(() => void reconectarRef.current(), 1500 * retriesRef.current);
      }
    }
  }, [setStatus]);

  const reconectarRef = useRef(reconectar);
  reconectarRef.current = reconectar;

  // Mantém callbacks frescos mesmo quando o TopBar remonta noutro ecrã
  useEffect(() => {
    actualizarCallbacksTranscricao({
      onParcial: setParcial,
      onFinal: (texto) => {
        const sid = obterSessionIdActivo();
        void guardarLinha(texto, sid);
      },
      onEstado: (estado) => {
        if (estado === "ligado") {
          retriesRef.current = 0;
          aReconectarRef.current = false;
          setStatus("ativa");
        } else if (estado === "erro") {
          if (aReconectarRef.current) return;
          void reconectarRef.current();
        }
      },
    });
  }, [guardarLinha, setParcial, setStatus]);

  const parar = useCallback(async () => {
    marcarPararTranscricao(true);
    aReconectarRef.current = false;
    pararTranscricaoRuntime();
    setParcial("");
    setStatus("parada");
    const sid = obterSessionIdActivo() ?? sessionId;
    definirSessionIdActivo(null);
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
    if (obterSessaoTranscricao()) return;
    marcarPararTranscricao(false);
    aReconectarRef.current = false;
    retriesRef.current = 0;
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
      definirSessionIdActivo(sid);
      setSessionId(sid);
      await ligarRef.current();
    } catch (e) {
      console.error(e);
      pararTranscricaoRuntime();
      definirSessionIdActivo(null);
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
    if (!obterSessaoTranscricao()) return;
    const novo = !micMudo;
    setMudoRuntime(novo);
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

  // Rehidrata o badge se a ligação WebRTC ainda estiver viva após navegação
  useEffect(() => {
    if (obterSessaoTranscricao() && status === "parada") {
      setStatus("ativa");
    }
  }, [setStatus, status]);

  return { status, iniciar, parar, alternarMic, micMudo };
}
