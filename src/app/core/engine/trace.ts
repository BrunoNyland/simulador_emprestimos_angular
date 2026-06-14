import { Decimal } from './decimal.config';

/**
 * Traço de cálculo: a explicação estruturada de COMO um valor foi obtido,
 * emitida pelo próprio motor (fonte única da verdade). A camada de UI apenas
 * formata este traço — não recalcula nada. Isso elimina a duplicação entre o
 * motor e o explicador e serve de especificação fiel para o port em C#.
 */
export interface PassoCalculo {
  /** Identificador estável do passo (a UI pode mapear/estilizar por ele). */
  id: string;
  /** Descrição legível do que o passo faz. */
  descricao: string;
  /**
   * Fórmula simbólica do passo (ex.: "1 + i"). Ausente em passos NARRATIVOS
   * (conceituais, sem aritmética fechada — ex.: uma iteração numérica).
   */
  formula?: string;
  /** Fórmula com os valores reais substituídos (aux. didático, arredondado). */
  substituicao?: string;
  /** Resultado do passo em ALTA precisão (string Decimal) — base p/ paridade. */
  resultado?: string;
  /** Nº de casas decimais sugerido para exibir o resultado. */
  casas?: number;
}

export interface TraceCalculo {
  /** Identificador estável do cálculo (ex.: "parcela-price"). */
  id: string;
  /** Título legível. */
  titulo: string;
  /** Fórmula fechada (forma final). */
  formula: string;
  /** Passos ordenados que levam ao resultado. */
  passos: PassoCalculo[];
  /** Resultado final em alta precisão (string Decimal). */
  resultado: string;
}

/**
 * Representação de um Decimal para EXIBIÇÃO na substituição (não afeta o
 * cálculo, que sempre usa alta precisão). Arredonda para `casas` e remove
 * zeros à direita supérfluos.
 */
export function disp(v: Decimal, casas = 6): string {
  return v.toDecimalPlaces(casas).toString();
}

/** Cria um passo de cálculo a partir de um resultado Decimal. */
export function passoCalculo(
  id: string,
  descricao: string,
  formula: string,
  substituicao: string,
  resultado: Decimal,
  casas = 6,
): PassoCalculo {
  return { id, descricao, formula, substituicao, resultado: resultado.toString(), casas };
}

/**
 * Cria um passo NARRATIVO (sem aritmética fechada): usado quando o passo é
 * conceitual — uma iteração numérica, uma soma sobre o cronograma, etc. A UI o
 * renderiza só com a descrição, sem a linha "fórmula = substituição = resultado".
 */
export function passoNota(id: string, descricao: string): PassoCalculo {
  return { id, descricao };
}

/** Monta um TraceCalculo cujo resultado é o do último passo numérico. */
export function montarTrace(
  id: string,
  titulo: string,
  formula: string,
  passos: PassoCalculo[],
): TraceCalculo {
  const ultimoNumerico = [...passos].reverse().find((p) => p.resultado != null);
  return { id, titulo, formula, passos, resultado: ultimoNumerico?.resultado ?? '0' };
}
