import { Decimal } from './decimal.config';

/** Um fluxo de caixa datado (em periodos-base a partir da liberacao). */
export interface FluxoCaixa {
  /** Prazo ate o fluxo, em periodos-base (ex.: dias/30 ou indice da parcela). */
  periodo: Decimal;
  /** Valor do fluxo (positivo = pago pelo cliente). */
  valor: Decimal;
}

export interface ResultadoCet {
  mensal: Decimal;
  anual: Decimal;
}

/**
 * Calcula o CET (Custo Efetivo Total) como a TIR do fluxo de caixa.
 * Ver CALCULATION_REFERENCE.md secao 5 (Resolucao CMN 4.881/2020).
 *
 * TODO Fase 2: implementar Newton-Raphson com fallback por bissecao.
 */
export function calcularCet(_valorLiberado: Decimal, _fluxos: FluxoCaixa[]): ResultadoCet {
  throw new Error('TODO Fase 2: calcularCet ainda nao implementado');
}
