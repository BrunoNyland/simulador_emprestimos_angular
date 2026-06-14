import { Decimal, arredondarMoeda } from './decimal.config';
import { ParametrosSimulacao, SistemaAmortizacao } from './models';
import { valorParcelaPrice, ResultadoComTrace } from './price';
import { mensalParaUnidade, taxaEfetivaMensal } from './rates';
import { disp, passoCalculo, TraceCalculo } from './trace';

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

/** Resultado de um cálculo de prazo (inteiro) acompanhado do traço. */
export interface ResultadoPrazoComTrace {
  n: number;
  trace: TraceCalculo;
}

/**
 * Valor presente Price CANÔNICO (com traço). PMT*(1-(1+i)^-n)/i (PMT*n se i=0).
 * `valorPresentePrice` é o wrapper fino que descarta o traço.
 */
export function calcularValorPresentePrice(
  pmt: Decimal,
  i: Decimal,
  n: number,
): ResultadoComTrace {
  if (i.isZero()) {
    const valor = pmt.times(n);
    return {
      valor,
      trace: {
        id: 'pv-price',
        titulo: 'Valor presente Price (PV) — taxa zero',
        formula: 'PV = PMT × n',
        resultado: valor.toString(),
        passos: [
          passoCalculo('pv', 'Sem juros, soma das parcelas iguais', 'PMT × n', `${disp(pmt, 2)} × ${n}`, valor, 2),
        ],
      },
    };
  }
  const base = i.plus(1);
  const pot = base.pow(-n);
  const num = new Decimal(1).minus(pot);
  const fator = num.div(i);
  const valor = pmt.times(fator);
  return {
    valor,
    trace: {
      id: 'pv-price',
      titulo: 'Valor presente Price (PV)',
      formula: 'PV = PMT × [ (1 − (1 + i)^−n) / i ]',
      resultado: valor.toString(),
      passos: [
        passoCalculo('base', 'Somar 1 à taxa', '1 + i', `1 + ${disp(i)}`, base),
        passoCalculo('pot', 'Fator de desconto total', '(1 + i)^−n', `${disp(base)}^−${n}`, pot),
        passoCalculo('num', 'Subtrair de 1', '1 − (1 + i)^−n', `1 − ${disp(pot)}`, num),
        passoCalculo('fator', 'Fator de valor presente da anuidade', '[1 − (1 + i)^−n] / i', `${disp(num)} / ${disp(i)}`, fator),
        passoCalculo('pv', 'Multiplicar pela parcela', 'PMT × fator', `${disp(pmt, 2)} × ${disp(fator)}`, valor, 2),
      ],
    },
  };
}

/** Valor presente Price a partir da parcela: PMT*(1-(1+i)^-n)/i (PMT*n se i=0). */
export function valorPresentePrice(pmt: Decimal, i: Decimal, n: number): Decimal {
  return calcularValorPresentePrice(pmt, i, n).valor;
}

/**
 * Prazo Price CANÔNICO (com traço). n = -ln(1 - PV*i/PMT)/ln(1+i).
 * `prazoPrice` é o wrapper fino que devolve só o inteiro.
 */
export function calcularPrazoPrice(pv: Decimal, pmt: Decimal, i: Decimal): ResultadoPrazoComTrace {
  if (i.isZero()) {
    const exato = pv.div(pmt);
    const n = Math.round(exato.toNumber());
    return {
      n,
      trace: {
        id: 'prazo-price',
        titulo: 'Prazo Price (n) — taxa zero',
        formula: 'n = PV / PMT',
        resultado: exato.toString(),
        passos: [passoCalculo('n', 'Sem juros, divide o principal pela parcela', 'PV / PMT', `${disp(pv, 2)} / ${disp(pmt, 2)}`, exato, 2)],
      },
    };
  }
  const jurosMes = pv.times(i);
  const arg = new Decimal(1).minus(jurosMes.div(pmt));
  if (arg.lessThanOrEqualTo(0)) {
    throw new Error('Parcela insuficiente para amortizar (PMT <= juros): prazo infinito.');
  }
  const lnArg = arg.ln();
  const lnBase = i.plus(1).ln();
  const exato = lnArg.negated().div(lnBase);
  const n = Math.round(exato.toNumber());
  return {
    n,
    trace: {
      id: 'prazo-price',
      titulo: 'Prazo Price (n)',
      formula: 'n = − ln(1 − PV·i / PMT) / ln(1 + i)',
      resultado: exato.toString(),
      passos: [
        passoCalculo('juros', 'Juros do 1º mês', 'PV × i', `${disp(pv, 2)} × ${disp(i)}`, jurosMes, 2),
        passoCalculo('frac', 'Fração da parcela consumida por juros', 'PV·i / PMT', `${disp(jurosMes, 2)} / ${disp(pmt, 2)}`, jurosMes.div(pmt)),
        passoCalculo('arg', 'Subtrair de 1', '1 − PV·i/PMT', `1 − ${disp(jurosMes.div(pmt))}`, arg),
        passoCalculo('lnArg', 'Logaritmo natural do argumento', 'ln(1 − PV·i/PMT)', `ln(${disp(arg)})`, lnArg),
        passoCalculo('lnBase', 'Logaritmo natural de (1 + i)', 'ln(1 + i)', `ln(${disp(i.plus(1))})`, lnBase),
        passoCalculo('n', 'Dividir e inverter o sinal (arredonda p/ inteiro)', '− lnArg / lnBase', `−${disp(lnArg)} / ${disp(lnBase)}`, exato, 2),
      ],
    },
  };
}

/** Prazo Price a partir de PV, PMT e i: -ln(1 - PV*i/PMT)/ln(1+i). */
export function prazoPrice(pv: Decimal, pmt: Decimal, i: Decimal): number {
  return calcularPrazoPrice(pv, pmt, i).n;
}

// --- SAC: relacoes pela 1a parcela (parcela1 = PV/n + PV*i) ---

/** 1a parcela SAC: PV/n + PV*i. */
export function primeiraParcelaSac(pv: Decimal, i: Decimal, n: number): Decimal {
  return pv.div(n).plus(pv.times(i));
}

/** PV SAC CANÔNICO (com traço): parcela1 / (1/n + i). */
export function calcularValorPresenteSac(
  parcela1: Decimal,
  i: Decimal,
  n: number,
): ResultadoComTrace {
  const cotaN = new Decimal(1).div(n);
  const fator = cotaN.plus(i);
  const valor = parcela1.div(fator);
  return {
    valor,
    trace: {
      id: 'pv-sac',
      titulo: 'Valor presente SAC (PV)',
      formula: 'PV = PMT₁ / (1/n + i)',
      resultado: valor.toString(),
      passos: [
        passoCalculo('cota', 'Fração de amortização por período', '1 / n', `1 / ${n}`, cotaN),
        passoCalculo('fator', 'Somar a taxa mensal', '1/n + i', `${disp(cotaN)} + ${disp(i)}`, fator),
        passoCalculo('pv', 'Dividir a 1ª parcela pelo fator', 'PMT₁ / fator', `${disp(parcela1, 2)} / ${disp(fator)}`, valor, 2),
      ],
    },
  };
}

/** PV SAC a partir da 1a parcela: parcela1 / (1/n + i). */
export function valorPresenteSac(parcela1: Decimal, i: Decimal, n: number): Decimal {
  return calcularValorPresenteSac(parcela1, i, n).valor;
}

/** Prazo SAC CANÔNICO (com traço): n = PV / (parcela1 - PV*i). */
export function calcularPrazoSac(pv: Decimal, parcela1: Decimal, i: Decimal): ResultadoPrazoComTrace {
  const jurosMes = pv.times(i);
  const amort = parcela1.minus(jurosMes);
  if (amort.lessThanOrEqualTo(0)) {
    throw new Error('1a parcela insuficiente (<= juros): prazo invalido no SAC.');
  }
  const exato = pv.div(amort);
  const n = Math.round(exato.toNumber());
  return {
    n,
    trace: {
      id: 'prazo-sac',
      titulo: 'Prazo SAC (n)',
      formula: 'n = PV / A    com  A = PMT₁ − PV·i',
      resultado: exato.toString(),
      passos: [
        passoCalculo('juros', 'Juros do 1º mês', 'PV × i', `${disp(pv, 2)} × ${disp(i)}`, jurosMes, 2),
        passoCalculo('amort', 'Amortização constante (deduz os juros da 1ª parcela)', 'A = PMT₁ − PV·i', `${disp(parcela1, 2)} − ${disp(jurosMes, 2)}`, amort, 2),
        passoCalculo('n', 'Dividir o principal pela amortização (arredonda p/ inteiro)', 'PV / A', `${disp(pv, 2)} / ${disp(amort, 2)}`, exato, 2),
      ],
    },
  };
}

/** Prazo SAC a partir de PV, 1a parcela e i: PV / (parcela1 - PV*i). */
export function prazoSac(pv: Decimal, parcela1: Decimal, i: Decimal): number {
  return calcularPrazoSac(pv, parcela1, i).n;
}

/** Taxa efetiva mensal SAC a partir de PV, 1a parcela e n: (parcela1 - PV/n)/PV. */
export function taxaSac(pv: Decimal, parcela1: Decimal, n: number): Decimal {
  const i = parcela1.minus(pv.div(n)).div(pv);
  if (i.lessThan(0)) {
    throw new Error('1a parcela menor que a amortizacao (PV/n): nao ha taxa >= 0.');
  }
  return i;
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
 * Conjunto de formulas de um sistema (Price ou SAC) para o solver.
 * No SAC, "parcela" refere-se a 1a parcela.
 */
interface KitSolver {
  parcelaDe: (pv: Decimal, i: Decimal, n: number) => Decimal;
  pvDe: (parcela: Decimal, i: Decimal, n: number) => Decimal;
  prazoDe: (pv: Decimal, parcela: Decimal, i: Decimal) => number;
  taxaDe: (pv: Decimal, parcela: Decimal, n: number) => Decimal;
}

const KIT_PRICE: KitSolver = {
  parcelaDe: valorParcelaPrice,
  pvDe: valorPresentePrice,
  prazoDe: prazoPrice,
  taxaDe: taxaPrice,
};

const KIT_SAC: KitSolver = {
  parcelaDe: primeiraParcelaSac,
  pvDe: valorPresenteSac,
  prazoDe: prazoSac,
  taxaDe: taxaSac,
};

/**
 * Resolve o campo-alvo a partir dos demais ("fixar 3, resolver 1").
 * Suporta Price e SAC (no SAC, a "parcela" e a 1a parcela).
 * Ver CALCULATION_REFERENCE.md secao 8.
 */
export function resolverCampoAlvo(entrada: EntradaSolver): SaidaSolver {
  const { sistema, parametros, parcela, campoAlvo } = entrada;
  let kit: KitSolver;
  if (sistema === 'price') {
    kit = KIT_PRICE;
  } else if (sistema === 'sac') {
    kit = KIT_SAC;
  } else {
    throw new Error(`Solver disponivel para price ou sac (recebido: ${sistema}).`);
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
      const pmt = arredondarMoeda(kit.parcelaDe(pv, i, n));
      return { parametros: { ...parametros }, parcela: pmt.toFixed(2) };
    }
    case 'valorBruto': {
      const novoBruto = arredondarMoeda(kit.pvDe(exigeParcela(), i, n));
      return {
        parametros: { ...parametros, valorBruto: novoBruto.toFixed(2) },
        parcela: exigeParcela().toFixed(2),
      };
    }
    case 'prazo': {
      const novoN = kit.prazoDe(pv, exigeParcela(), i);
      return { parametros: { ...parametros, prazo: novoN }, parcela: exigeParcela().toFixed(2) };
    }
    case 'taxa': {
      const im = kit.taxaDe(pv, exigeParcela(), n);
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
