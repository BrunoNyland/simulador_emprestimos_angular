import { Decimal, arredondarMoeda, CASAS_MONETARIAS } from './decimal.config';
import { Parcela } from './models';
import { adicionarMeses } from './dates';
import { disp, passoCalculo, TraceCalculo } from './trace';

/** Entrada para geracao de cronograma de amortizacao. */
export interface EntradaCronograma {
  /** Principal financiado (saldo inicial / valor bruto). */
  principal: Decimal;
  /** Taxa efetiva do periodo (ex.: mensal). */
  taxaPeriodo: Decimal;
  /** Numero de parcelas. */
  prazo: number;
  /** Data-base (ISO) para gerar vencimentos mensais; opcional. */
  dataBase?: string;
}

/** Valor de um calculo + o traco estruturado de como foi obtido. */
export interface ResultadoComTrace {
  valor: Decimal;
  trace: TraceCalculo;
}

/**
 * Calculo CANONICO da parcela Price (PMT), com traco estruturado.
 * E a unica implementacao da formula: `valorParcelaPrice` apenas descarta o
 * traco. Assim o valor e a explicacao nunca divergem (CALC_REF secao 2).
 */
export function calcularParcelaPrice(principal: Decimal, i: Decimal, n: number): ResultadoComTrace {
  if (n <= 0) {
    throw new Error('Prazo deve ser >= 1');
  }

  if (i.isZero()) {
    const valor = principal.div(n);
    return {
      valor,
      trace: {
        id: 'parcela-price',
        titulo: 'Parcela Price (PMT) — taxa zero',
        formula: 'PMT = PV / n',
        resultado: valor.toString(),
        passos: [
          passoCalculo(
            'div',
            'Sem juros, a parcela é o principal dividido pelo número de parcelas',
            'PV / n',
            `${disp(principal, 2)} / ${n}`,
            valor,
            2,
          ),
        ],
      },
    };
  }

  const base = i.plus(1);
  const pot = base.pow(-n);
  const denom = new Decimal(1).minus(pot);
  const fator = i.div(denom);
  const valor = principal.times(fator);

  return {
    valor,
    trace: {
      id: 'parcela-price',
      titulo: 'Parcela Price (PMT)',
      formula: 'PMT = PV × [ i / (1 − (1 + i)^−n) ]',
      resultado: valor.toString(),
      passos: [
        passoCalculo('base', 'Somar 1 à taxa de juros', '1 + i', `1 + ${disp(i)}`, base),
        passoCalculo(
          'pot',
          'Elevar à potência negativa do prazo (fator de desconto da última parcela)',
          '(1 + i)^−n',
          `${disp(base)}^−${n}`,
          pot,
        ),
        passoCalculo('denom', 'Subtrair de 1', '1 − (1 + i)^−n', `1 − ${disp(pot)}`, denom),
        passoCalculo(
          'fator',
          'Dividir a taxa pelo resultado (fator de recuperação de capital)',
          'i / [1 − (1 + i)^−n]',
          `${disp(i)} / ${disp(denom)}`,
          fator,
        ),
        passoCalculo(
          'pmt',
          'Multiplicar pelo principal',
          'PV × fator',
          `${disp(principal, 2)} × ${disp(fator)}`,
          valor,
          2,
        ),
      ],
    },
  };
}

/** Valor da parcela Price (PMT). PV*i/(1-(1+i)^-n), ou PV/n se i=0. */
export function valorParcelaPrice(principal: Decimal, i: Decimal, n: number): Decimal {
  return calcularParcelaPrice(principal, i, n).valor;
}

/**
 * Gera o cronograma pelo sistema Price (parcela constante).
 * Ver CALCULATION_REFERENCE.md secao 2.
 *
 * Convencao: PMT arredondado para 2 casas (half-even); juros e amortizacao em
 * 2 casas; a ultima parcela absorve o residuo (Sum amortizacao = principal).
 */
export function gerarCronogramaPrice(entrada: EntradaCronograma): Parcela[] {
  const { principal, taxaPeriodo: i, prazo: n, dataBase } = entrada;
  const pmt = arredondarMoeda(valorParcelaPrice(principal, i, n));

  const parcelas: Parcela[] = [];
  let saldo = principal;

  for (let k = 1; k <= n; k++) {
    const saldoInicial = saldo;
    const juros = arredondarMoeda(saldoInicial.times(i));

    let amortizacao: Decimal;
    let valorParcela: Decimal;
    let residuoValor: Decimal | undefined;
    if (k === n) {
      const amortTeorica = pmt.minus(juros);
      amortizacao = saldoInicial; // ultima parcela absorve o residuo
      valorParcela = arredondarMoeda(amortizacao.plus(juros));
      residuoValor = amortizacao.minus(amortTeorica);
    } else {
      amortizacao = pmt.minus(juros);
      valorParcela = pmt;
    }

    saldo = saldoInicial.minus(amortizacao);

    parcelas.push({
      numero: k,
      dataVencimento: dataBase ? adicionarMeses(dataBase, k) : '',
      saldoInicial: arredondarMoeda(saldoInicial).toFixed(CASAS_MONETARIAS),
      juros: juros.toFixed(CASAS_MONETARIAS),
      amortizacao: arredondarMoeda(amortizacao).toFixed(CASAS_MONETARIAS),
      encargos: new Decimal(0).toFixed(CASAS_MONETARIAS),
      valorParcela: valorParcela.toFixed(CASAS_MONETARIAS),
      saldoFinal: arredondarMoeda(saldo).toFixed(CASAS_MONETARIAS),
      residuo: residuoValor && !residuoValor.isZero() ? residuoValor.toFixed(CASAS_MONETARIAS) : undefined,
    });
  }

  return parcelas;
}
