import { Decimal } from './decimal.config';
import { TipoTaxa, UnidadeTaxa } from './models';

/** Taxa efetiva mensal -> anual: (1+i)^12 - 1. */
export function efetivaMensalParaAnual(im: Decimal): Decimal {
  return im.plus(1).pow(12).minus(1);
}

/** Taxa efetiva anual -> mensal: (1+i)^(1/12) - 1. */
export function efetivaAnualParaMensal(ia: Decimal): Decimal {
  return ia.plus(1).pow(new Decimal(1).div(12)).minus(1);
}

/** Taxa nominal anual -> mensal: i / 12. */
export function nominalAnualParaMensal(inom: Decimal): Decimal {
  return inom.div(12);
}

/**
 * Normaliza qualquer taxa informada para a taxa EFETIVA MENSAL usada no
 * cronograma (periodicidade mensal). Ver CALCULATION_REFERENCE.md secao 1.
 */
export function taxaEfetivaMensal(taxa: Decimal, tipo: TipoTaxa, unidade: UnidadeTaxa): Decimal {
  if (unidade === 'mensal') {
    // Em base mensal nao ha subperiodo: nominal mensal == efetiva mensal.
    return taxa;
  }
  // unidade anual
  return tipo === 'efetiva' ? efetivaAnualParaMensal(taxa) : nominalAnualParaMensal(taxa);
}

/** Converte uma taxa efetiva mensal de volta para a unidade/tipo informados. */
export function mensalParaUnidade(im: Decimal, tipo: TipoTaxa, unidade: UnidadeTaxa): Decimal {
  if (unidade === 'mensal') {
    return im;
  }
  return tipo === 'efetiva' ? efetivaMensalParaAnual(im) : im.times(12);
}

/**
 * Taxa proporcional para periodo irregular/carencia (CALC_REF secao 6).
 * @param modo 'composta' = (1+i)^(d/p)-1 ; 'linear' = i*(d/p)
 */
export function taxaPeriodoIrregular(
  i: Decimal,
  dias: number,
  diasPeriodo: number,
  modo: 'composta' | 'linear',
): Decimal {
  const frac = new Decimal(dias).div(diasPeriodo);
  return modo === 'composta' ? i.plus(1).pow(frac).minus(1) : i.times(frac);
}
