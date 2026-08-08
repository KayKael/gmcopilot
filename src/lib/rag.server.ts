/** Divisão de documentos em pedaços para indexação semântica. */

export interface Pedaco {
  index: number;
  content: string;
}

const MAX = 800;
const OVERLAP = 100;

export function dividirDocumento(texto: string): Pedaco[] {
  const secoes = texto
    .split(/\n(?=#{1,6}\s)/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const pedacos: string[] = [];
  for (const secao of secoes.length ? secoes : [texto]) {
    const titulo = secao.startsWith("#") ? (secao.split("\n")[0] ?? "") : "";
    const corpo = secao.trim();
    if (corpo.length <= MAX) {
      pedacos.push(corpo);
      continue;
    }
    let i = 0;
    while (i < corpo.length) {
      const fatia = corpo.slice(i, i + MAX);
      pedacos.push(titulo && i > 0 ? `${titulo}\n${fatia}` : fatia);
      i += MAX - OVERLAP;
    }
  }
  return pedacos
    .map((content, index) => ({ index, content: content.trim() }))
    .filter((p) => p.content.length > 20);
}
