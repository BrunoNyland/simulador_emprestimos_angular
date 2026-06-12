import { Decimal, arredondarMoeda, CASAS_MONETARIAS } from './decimal.config';
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
