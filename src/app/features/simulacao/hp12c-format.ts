/**
 * Tokenizador das instruções da HP12C para renderização como "teclas".
 *
 * É lógica de apresentação PURA (sem Angular): recebe uma linha de instrução
 * (ex.: "1000 CHS PV   (valor financiado)") e devolve segmentos classificados
 * em teclas de função, operandos numéricos e texto, além do comentário. Fica
 * isolado do componente para ser testável e reaproveitável.
 */

/** Segmento de uma instrução da HP12C. */
export interface HpSeg {
  tipo: 'tecla' | 'num' | 'texto';
  texto: string;
  /** Tecla modificadora (f dourada, g azul) — só para `tipo: 'tecla'`. */
  modificador?: 'f' | 'g';
}

/** Uma linha de instrução da HP12C, já tokenizada. */
export interface HpLinha {
  segs: HpSeg[];
  comentario: string;
  /** true quando a linha é uma frase (e não uma sequência pura de teclas). */
  prosa: boolean;
}

/**
 * Teclas de função da HP12C (case-sensitive). Tokens que casam aqui viram
 * "botões"; o restante é número (operando) ou texto explicativo.
 */
const HP_TECLAS = new Set([
  'ENTER', 'CHS', 'PV', 'PMT', 'FV', 'n', 'i', 'f', 'g', 'STO', 'RCL', 'CLX',
  'CF0', 'CFo', 'CFj', 'Nj', 'IRR', 'NPV', 'END', 'BEG', 'x><y', '1/x',
  '%', '%T', 'EEX', 'R/S', 'GTO', '÷', '×', '−', '-', '+', '=',
]);

function ehTecla(t: string): boolean {
  return HP_TECLAS.has(t);
}

function ehNumero(t: string): boolean {
  return /\d/.test(t) && /^[-]?[\d.,]+%?$/.test(t);
}

/**
 * Quebra uma linha de instrução em segmentos renderizáveis. Linhas que são
 * frases (têm palavras que não são teclas nem números) viram "prosa", com as
 * teclas ainda destacadas como botões inline.
 */
export function analisarLinhaHp12c(linha: string): HpLinha {
  // 1) separa o comentário: tudo a partir de "→" ou de um parêntese final.
  let principal = linha;
  let comentario = '';
  const seta = linha.indexOf('→');
  if (seta >= 0) {
    comentario = linha.slice(seta).trim();
    principal = linha.slice(0, seta);
  }
  const parFinal = principal.match(/\s*(\([^)]*\))\s*$/);
  if (parFinal) {
    comentario = (parFinal[1] + (comentario ? ' ' + comentario : '')).trim();
    principal = principal.slice(0, parFinal.index).trim();
  }

  const tokens = principal.trim().split(/\s+/).filter(Boolean);
  const keystroke = tokens.length > 0 && tokens.every((t) => ehTecla(t) || ehNumero(t));

  const segs: HpSeg[] = tokens.map((t) => {
    if (ehTecla(t)) {
      const seg: HpSeg = { tipo: 'tecla', texto: t };
      if (t === 'f' || t === 'g') seg.modificador = t;
      return seg;
    }
    if (keystroke && ehNumero(t)) return { tipo: 'num', texto: t };
    return { tipo: 'texto', texto: t };
  });

  return { segs, comentario, prosa: !keystroke };
}
