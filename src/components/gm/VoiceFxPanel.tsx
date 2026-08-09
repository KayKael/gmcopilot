import {
  AudioWaveform,
  ExternalLink,
  Headphones,
  Loader2,
  Mic,
  MonitorSpeaker,
  Square,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useVoiceFx } from "@/hooks/useVoiceFx";
import { VOICE_PRESETS } from "@/lib/voice-presets";
import { useSessionStore } from "@/store/session";

function SliderCampo({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground/80">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full accent-primary disabled:opacity-40"
      />
    </label>
  );
}

export function VoiceFxPanel() {
  const statusSessao = useSessionStore((s) => s.status);
  const sessaoActiva = statusSessao !== "parada";

  const {
    activo,
    aArrancar,
    nivel,
    presetKey,
    personalizado,
    params,
    monitorLigado,
    outputId,
    saidas,
    exporSistema,
    caboDetectado,
    micSistemaLabel,
    vbCableUrl,
    activar,
    parar,
    escolherPreset,
    actualizarCampo,
    alternarMonitor,
    escolherSaida,
    alternarExporSistema,
  } = useVoiceFx();

  return (
    <div className="mx-auto grid h-full min-h-0 w-full max-w-6xl grid-cols-1 gap-3 p-3 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
      {/* Perfis */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-panel">
        <div className="shrink-0 border-b border-border px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Perfis
          </h2>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-none p-2">
          {VOICE_PRESETS.map((p) => {
            const seleccionado = presetKey === p.key && !personalizado;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => escolherPreset(p.key)}
                className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                  seleccionado
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary/30 hover:bg-secondary/60"
                }`}
              >
                <p className="text-sm font-medium">{p.nome}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{p.descricao}</p>
              </button>
            );
          })}
          {personalizado && (
            <div className="rounded-md border border-dashed border-border px-3 py-2.5">
              <p className="text-sm font-medium">Personalizado</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Ajustes manuais sobre {VOICE_PRESETS.find((p) => p.key === presetKey)?.nome ?? "perfil"}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Controlo */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-panel">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sessão de voz
          </h2>
          <AudioWaveform className={`h-4 w-4 ${activo ? "text-primary" : "text-muted-foreground"}`} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scrollbar-none p-4">
          {sessaoActiva && (
            <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              A sessão de transcrição está activa — para a sessão antes de activar a voz,
              ou activa a voz primeiro e depois inicia a sessão (usa o microfone do app).
            </div>
          )}

          <div className="flex items-start gap-2 rounded-md border border-border/70 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
            <Headphones className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              O browser não cria microfones no Windows. Com o{" "}
              <span className="text-foreground/80">VB-Cable</span>, a app envia a voz
              alterada para “CABLE Input” e o Discord usa “CABLE Output” como microfone.
            </p>
          </div>

          <div className="space-y-2 rounded-md border border-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <MonitorSpeaker className="h-3.5 w-3.5 shrink-0" />
                  Microfone no Windows
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {caboDetectado
                    ? exporSistema && activo
                      ? `Activo → escolhe “${micSistemaLabel ?? "CABLE Output"}” no Discord`
                      : "VB-Cable detectado — activa a voz para expor"
                    : "Instala o VB-Cable (grátis) para criar o microfone virtual"}
                </p>
              </div>
              <Switch
                checked={exporSistema}
                onCheckedChange={(v) => void alternarExporSistema(v)}
                aria-label="Expor voz alterada no Windows"
              />
            </div>
            {!caboDetectado && (
              <a
                href={vbCableUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Descarregar VB-Cable
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {exporSistema && caboDetectado && (
              <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                <li>Activa a alteração de voz nesta página</li>
                <li>
                  No Discord/Zoom: microfone ={" "}
                  <span className="text-foreground/85">
                    {micSistemaLabel ?? "CABLE Output (VB-Audio Virtual Cable)"}
                  </span>
                </li>
                <li>Usa auscultadores e “Ouvir-me” para te ouvires sem eco</li>
              </ol>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!activo ? (
              <Button
                disabled={sessaoActiva || aArrancar}
                onClick={() => void activar()}
              >
                {aArrancar ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                Ativar
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => void parar()}>
                <Square className="h-4 w-4" />
                Parar
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {activo
                ? personalizado
                  ? "Activo · personalizado"
                  : `Activo · ${VOICE_PRESETS.find((p) => p.key === presetKey)?.nome ?? presetKey}`
                : "Parado"}
            </span>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              Nível
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-75"
                style={{ width: `${Math.round(nivel * 100)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Ouvir-me</p>
              <p className="text-[11px] text-muted-foreground">Retorno da voz processada</p>
            </div>
            <Switch
              checked={monitorLigado}
              onCheckedChange={alternarMonitor}
              aria-label="Ouvir retorno da voz"
            />
          </div>

          <div className="flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(params.monitorGain * 100)}
              disabled={!monitorLigado}
              onChange={(e) => actualizarCampo("monitorGain", Number(e.target.value) / 100)}
              className="h-1.5 w-full accent-primary disabled:opacity-40"
              aria-label="Volume do retorno"
            />
            <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {Math.round(params.monitorGain * 100)}
            </span>
          </div>

          {saidas.length > 0 && (
            <label className="block space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {exporSistema ? "Auscultadores (Ouvir-me)" : "Saída de áudio"}
              </span>
              <select
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                value={outputId ?? ""}
                onChange={(e) => void escolherSaida(e.target.value || null)}
              >
                <option value="">Predefinida do sistema</option>
                {saidas.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Saída ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {/* Personalizar */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-panel">
        <div className="shrink-0 border-b border-border px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Personalizar agora
          </h2>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-none p-3">
          <SliderCampo
            label="Pitch"
            value={params.pitchSemitones}
            min={-12}
            max={6}
            step={0.5}
            display={`${params.pitchSemitones > 0 ? "+" : ""}${params.pitchSemitones} st`}
            onChange={(v) => actualizarCampo("pitchSemitones", v)}
          />
          <SliderCampo
            label="Distorção"
            value={params.distortion}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(params.distortion * 100)}%`}
            onChange={(v) => actualizarCampo("distortion", v)}
          />
          <SliderCampo
            label="Grave"
            value={params.bassDb}
            min={-6}
            max={14}
            step={0.5}
            display={`${params.bassDb > 0 ? "+" : ""}${params.bassDb} dB`}
            onChange={(v) => actualizarCampo("bassDb", v)}
          />
          <SliderCampo
            label="Reverb"
            value={params.reverb}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(params.reverb * 100)}%`}
            onChange={(v) => actualizarCampo("reverb", v)}
          />
          <SliderCampo
            label="Wet / Dry"
            value={params.wet}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(params.wet * 100)}% wet`}
            onChange={(v) => actualizarCampo("wet", v)}
          />
        </div>
      </section>
    </div>
  );
}
