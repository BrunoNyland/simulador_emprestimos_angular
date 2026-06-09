import { Decimal, arredondarMoeda } from './decimal.config';
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
    const amortizacao = k === n ? saldoInicial : amortBase; // ultima absorve residuo
    const valorParcela = arredondarMoeda(amortizacao.plus(juros));

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
