import { Decimal, arredondarMoeda } from './decimal.config';
import { ParametrosSimulacao, SistemaAmortizacao } from './models';
import { valorParcelaPrice } from './price';
import { mensalParaUnidade, taxaEfetivaMensal } from './rates';

/** Campo que o solver deve resolver (os demais ficam travados). */
export type CampoAlvo = 'valorBruto' | 'taxa' | 'prazo' | 'parcela';

export interface EntradaSolver {
  sistema: SistemaAmortizacao;
  parametros: ParametrosSimulacao;
  /** Valor da parcela, quando informado (necessario p/ alvo != parcela). */
  parcela?: string;
  campoAlvo: CampoAlvo;
}

export interface SaidaSolver {
  parametros: ParametrosSimulacao;
  /** Valor da parcela resultante (Price). */
  parcela: string;
}

/** Valor presente Price a partir da parcela: PMT*(1-(1+i)^-n)/i (PMT*n se i=0). */
export function valorPresentePrice(pmt: Decimal, i: Decimal, n: number): Decimal {
  if (i.isZero()) {
    return pmt.times(n);
  }
  return pmt.times(new Decimal(1).minus(i.plus(1).pow(-n))).div(i);
}

/** Prazo Price a partir de PV, PMT e i: -ln(1 - PV*i/PMT)/ln(1+i). */
export function prazoPrice(pv: Decimal, pmt: Decimal, i: Decimal): number {
  if (i.isZero()) {
    return Math.round(pv.div(pmt).toNumber());
  }
  const arg = new Decimal(1).minus(pv.times(i).div(pmt));
  if (arg.lessThanOrEqualTo(0)) {
    throw new Error('Parcela insuficiente para amortizar (PMT <= juros): prazo infinito.');
  }
  const n = arg.ln().negated().div(i.plus(1).ln());
  return Math.round(n.toNumber());
}

/** Taxa efetiva mensal Price a partir de PV, PMT e n (bissecao). */
export function taxaPrice(pv: Decimal, pmt: Decimal, n: number): Decimal {
  const tol = new Decimal('1e-12');
  // g(i) = PMT(PV,i,n) - PMT; crescente em i. g(0) = PV/n - PMT <= 0.
  const g = (i: Decimal) => valorParcelaPrice(pv, i, n).minus(pmt);

  let baixo = new Decimal(0);
  let alto = new Decimal(10);
  if (g(baixo).greaterThan(tol)) {
    throw new Error('Parcela menor que o minimo (PV/n): nao ha taxa >= 0 que satisfaca.');
  }
  if (g(alto).lessThan(0)) {
    alto = new Decimal(100);
  }

  let meio = baixo;
  for (let k = 0; k < 300; k++) {
    meio = baixo.plus(alto).div(2);
    const gm = g(meio);
    if (gm.abs().lessThan(tol) || alto.minus(baixo).abs().lessThan(tol)) {
      return meio;
    }
    if (gm.lessThan(0)) {
      baixo = meio;
    } else {
      alto = meio;
    }
  }
  return meio;
}

/**
 * Resolve o campo-alvo a partir dos demais (relacao Price "fixar 3, resolver 1").
 * Ver CALCULATION_REFERENCE.md secao 8.
 *
 * Nota: o solver inverso para SAC sera adicionado em fase posterior; o cronograma
 * SAC ja e gerado por gerarCronogramaSac.
 */
export function resolverCampoAlvo(entrada: EntradaSolver): SaidaSolver {
  const { sistema, parametros, parcela, campoAlvo } = entrada;
  if (sistema !== 'price') {
    throw new Error(`Solver inverso disponivel apenas para Price nesta fase (recebido: ${sistema}).`);
  }

  const pv = new Decimal(parametros.valorBruto);
  const i = taxaEfetivaMensal(
    new Decimal(parametros.taxa),
    parametros.tipoTaxa,
    parametros.unidadeTaxa,
  );
  const n = parametros.prazo;
  const pmtInformado = parcela !== undefined ? new Decimal(parcela) : undefined;

  const exigeParcela = (): Decimal => {
    if (pmtInformado === undefined) {
      throw new Error(`Campo-alvo "${campoAlvo}" exige o valor da parcela informado.`);
    }
    return pmtInformado;
  };

  switch (campoAlvo) {
    case 'parcela': {
      const pmt = arredondarMoeda(valorParcelaPrice(pv, i, n));
      return { parametros: { ...parametros }, parcela: pmt.toFixed(2) };
    }
    case 'valorBruto': {
      const novoPv = valorPresentePrice(exigeParcela(), i, n);
      const novoBruto = arredondarMoeda(novoPv);
      return {
        parametros: { ...parametros, valorBruto: novoBruto.toFixed(2) },
        parcela: exigeParcela().toFixed(2),
      };
    }
    case 'prazo': {
      const novoN = prazoPrice(pv, exigeParcela(), i);
      return { parametros: { ...parametros, prazo: novoN }, parcela: exigeParcela().toFixed(2) };
    }
    case 'taxa': {
      const im = taxaPrice(pv, exigeParcela(), n);
      const novaTaxa = mensalParaUnidade(im, parametros.tipoTaxa, parametros.unidadeTaxa);
      return {
        parametros: { ...parametros, taxa: novaTaxa.toDecimalPlaces(10).toString() },
        parcela: exigeParcela().toFixed(2),
      };
    }
    default:
      throw new Error(`Campo-alvo desconhecido: ${campoAlvo}`);
  }
}
