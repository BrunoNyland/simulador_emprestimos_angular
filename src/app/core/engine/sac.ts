import { Decimal, arredondarMoeda, CASAS_MONETARIAS } from './decimal.config';
import { Parcela } from './models';
import { adicionarMeses } from './dates';
import { EntradaCronograma } from './price';

/**
 * Gera o cronograma pelo sistema SAC (amortizacao constante).
 * Ver CALCULATION_REFERENCE.md secao 3.
 *
 * Convencao: amortizacao = principal/n arredondada (2 casas); juros sobre o
 * saldo; a ultima parcela absorve o residuo (Sum amortizacao = principal).
 */
export function gerarCronogramaSac(entrada: EntradaCronograma): Parcela[] {
  const { principal, taxaPeriodo: i, prazo: n, dataBase } = entrada;
  if (n <= 0) {
    throw new Error('Prazo deve ser >= 1');
  }
  const amortBase = arredondarMoeda(principal.div(n));

  const parcelas: Parcela[] = [];
  let saldo = principal;

  for (let k = 1; k <= n; k++) {
    const saldoInicial = saldo;
    const juros = arredondarMoeda(saldoInicial.times(i));
    let amortizacao = amortBase;
    let residuoValor: Decimal | undefined;
    if (k === n) {
      const amortTeorica = amortBase;
      amortizacao = saldoInicial; // ultima absorve residuo
      residuoValor = amortizacao.minus(amortTeorica);
    }
    const valorParcela = arredondarMoeda(amortizacao.plus(juros));

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
