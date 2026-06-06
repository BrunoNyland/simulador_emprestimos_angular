import { Decimal } from './decimal.config';
import { Parcela, Publico } from './models';

/** Parametros de IOF vindos da config regulatoria. */
export interface ParametrosIof {
  aliquotaDiaria: Decimal;
  aliquotaAdicional: Decimal;
  limiteDias: number;
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

/**
 * Calcula o IOF total (diario + adicional) da operacao.
 * Ver CALCULATION_REFERENCE.md secao 4 (Decreto 6.306/2007).
 *
 * TODO Fase 2: implementar IOF diario por parcela (cap de dias), adicional e isencoes.
 */
export function calcularIof(_entrada: EntradaIof): Decimal {
  throw new Error('TODO Fase 2: calcularIof ainda nao implementado');
}
