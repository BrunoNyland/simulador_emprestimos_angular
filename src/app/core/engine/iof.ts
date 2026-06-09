import { Decimal, arredondarMoeda } from './decimal.config';
import { Parcela, Publico } from './models';
import { diasCorridos } from './dates';

/** Parametros de IOF vindos da config regulatoria (ja resolvidos por publico). */
export interface ParametrosIof {
  /** Aliquota diaria (fracao por dia) ja escolhida conforme o publico. */
  aliquotaDiaria: Decimal;
  /** Aliquota adicional fixa (fracao sobre o principal). */
  aliquotaAdicional: Decimal;
  /** Teto de dias do IOF diario por parcela. */
  limiteDias: number;
  /** Se o produto e isento de IOF. */
  isento: boolean;
}

export interface EntradaIof {
  publico: Publico;
  principal: Decimal;
  parcelas: Parcela[];
  /** Data de liberacao (ISO). */
  dataLiberacao: string;
  parametros: ParametrosIof;
}

export interface ResultadoIof {
  diario: Decimal;
  adicional: Decimal;
  total: Decimal;
}

/**
 * Calcula o IOF (diario + adicional) da operacao.
 * Ver CALCULATION_REFERENCE.md secao 4 (Decreto 6.306/2007).
 *
 * IOF diario = Sum( amortizacao_k * aliquotaDiaria * min(dias_k, limiteDias) )
 * IOF adicional = principal * aliquotaAdicional
 */
export function calcularIof(entrada: EntradaIof): ResultadoIof {
  const { principal, parcelas, dataLiberacao, parametros } = entrada;

  if (parametros.isento) {
    const zero = new Decimal(0);
    return { diario: zero, adicional: zero, total: zero };
  }

  let diario = new Decimal(0);
  for (const p of parcelas) {
    const amort = new Decimal(p.amortizacao);
    const diasReais = diasCorridos(dataLiberacao, p.dataVencimento);
    const dias = Math.min(diasReais, parametros.limiteDias);
    diario = diario.plus(amort.times(parametros.aliquotaDiaria).times(dias));
  }

  const adicional = principal.times(parametros.aliquotaAdicional);

  return {
    diario: arredondarMoeda(diario),
    adicional: arredondarMoeda(adicional),
    total: arredondarMoeda(diario.plus(adicional)),
  };
}
