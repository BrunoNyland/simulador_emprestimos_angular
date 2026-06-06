import { Decimal } from './decimal.config';
import { Parcela } from './models';

/** Entrada para geracao de cronograma de amortizacao. */
export interface EntradaCronograma {
  /** Principal financiado (saldo inicial / valor bruto). */
  principal: Decimal;
  /** Taxa efetiva do periodo (ex.: mensal). */
  taxaPeriodo: Decimal;
  /** Numero de parcelas. */
  prazo: number;
}

/**
 * Gera o cronograma pelo sistema Price (parcela constante).
 * Ver CALCULATION_REFERENCE.md secao 2.
 *
 * TODO Fase 2: implementar PMT, juros/amortizacao por parcela e ajuste de residuo.
 */
export function gerarCronogramaPrice(_entrada: EntradaCronograma): Parcela[] {
  throw new Error('TODO Fase 2: gerarCronogramaPrice ainda nao implementado');
}
