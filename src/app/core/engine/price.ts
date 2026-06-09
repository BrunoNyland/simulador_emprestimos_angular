import { Decimal, arredondarMoeda } from './decimal.config';
import { Parcela } from './models';
import { adicionarMeses } from './dates';

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

/** Valor da parcela Price (PMT). PV*i/(1-(1+i)^-n), ou PV/n se i=0. */
export function valorParcelaPrice(principal: Decimal, i: Decimal, n: number): Decimal {
  if (n <= 0) {
    throw new Error('Prazo deve ser >= 1');
  }
  if (i.isZero()) {
    return principal.div(n);
  }
  const fator = new Decimal(1).minus(i.plus(1).pow(-n));
  return principal.times(i).div(fator);
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
    if (k === n) {
      amortizacao = saldoInicial; // ultima parcela absorve o residuo
      valorParcela = arredondarMoeda(amortizacao.plus(juros));
    } else {
      amortizacao = pmt.minus(juros);
      valorParcela = pmt;
    }

    saldo = saldoInicial.minus(amortizacao);

    parcelas.push({
      numero: k,
      dataVencimento: dataBase ? adicionarMeses(dataBase, k) : '',
      saldoInicial: arredondarMoeda(saldoInicial).toFixed(2),
      juros: juros.toFixed(2),
      amortizacao: arredondarMoeda(amortizacao).toFixed(2),
      encargos: '0.00',
      valorParcela: valorParcela.toFixed(2),
      saldoFinal: arredondarMoeda(saldo).toFixed(2),
    });
  }

  return parcelas;
}
