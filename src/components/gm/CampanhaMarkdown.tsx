import { Fragment, type ReactNode } from "react";

/** Renderiza markdown leve (títulos, listas, negrito, itálico, código) sem deps. */
export function CampanhaMarkdown({ text }: { text: string }) {
  const blocos = text.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);

  return (
    <div className="space-y-2 text-[13px] leading-snug text-foreground/95">
      {blocos.map((bloco, i) => (
        <Fragment key={i}>{renderBloco(bloco)}</Fragment>
      ))}
    </div>
  );
}

function renderBloco(bloco: string): ReactNode {
  const linhas = bloco.split("\n").map((l) => l.trimEnd());
  if (!linhas.length) return null;

  // Lista com bullets
  if (linhas.every((l) => /^[-*•]\s+/.test(l.trim()) || l.trim() === "")) {
    const items = linhas.filter((l) => l.trim()).map((l) => l.replace(/^[-*•]\s+/, ""));
    return (
      <ul className="my-0.5 list-disc space-y-1 pl-4 marker:text-muted-foreground">
        {items.map((item, i) => (
          <li key={i} className="pl-0.5">
            {inline(item)}
          </li>
        ))}
      </ul>
    );
  }

  // Lista numerada
  if (linhas.every((l) => /^\d+[.)]\s+/.test(l.trim()) || l.trim() === "")) {
    const items = linhas.filter((l) => l.trim()).map((l) => l.replace(/^\d+[.)]\s+/, ""));
    return (
      <ol className="my-0.5 list-decimal space-y-1 pl-4 marker:text-muted-foreground">
        {items.map((item, i) => (
          <li key={i} className="pl-0.5">
            {inline(item)}
          </li>
        ))}
      </ol>
    );
  }

  // Título markdown
  const primeira = linhas[0]?.trim() ?? "";
  const heading = primeira.match(/^(#{1,3})\s+(.+)$/);
  if (heading && linhas.length === 1) {
    const nivel = heading[1]!.length;
    const cls =
      nivel === 1
        ? "text-sm font-semibold tracking-tight"
        : nivel === 2
          ? "text-[13px] font-semibold"
          : "text-[12px] font-semibold uppercase tracking-wide text-muted-foreground";
    return <p className={cls}>{inline(heading[2]!)}</p>;
  }

  // Parágrafo com quebras simples
  return (
    <p className="my-0">
      {linhas.map((linha, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {inline(linha)}
        </Fragment>
      ))}
    </p>
  );
}

/** **negrito**, *itálico*, `código` */
function inline(texto: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > last) parts.push(texto.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      parts.push(
        <em key={key++} className="italic text-foreground/90">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      parts.push(
        <code
          key={key++}
          className="rounded bg-background/60 px-1 py-0.5 font-mono text-[11px] text-foreground"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + token.length;
  }
  if (last < texto.length) parts.push(texto.slice(last));
  return parts.length ? parts : texto;
}
