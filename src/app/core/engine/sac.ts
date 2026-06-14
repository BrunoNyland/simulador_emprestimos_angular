import { Decimal, arredondarMoeda, CASAS_MONETARIAS } from './decimal.config';
import { Parcela } from './models';
import { adicionarMeses } from './dates';
import { EntradaCronograma, ResultadoComTrace } from './price';
import { disp, passoCalculo } from './trace';

/**
 * Calculo CANONICO da 1a parcela SAC (a maior), com traco estruturado.
 * 1a parcela = amortizacao constante (PV/n) + juros do 1o mes (PV*i).
 * Ver CALCULATION_REFERENCE.md secao 3.
 */
export function calcularPrimeiraParcelaSac(
  principal: Decimal,
  i: Decimal,
  n: number,
): ResultadoComTrace {
  if (n <= 0) {
    throw new Error('Prazo deve ser >= 1');
  }
  const amort = principal.div(n);
  const juros = principal.times(i);
  const valor = amort.plus(juros);

  return {
    valor,
    trace: {
      id: 'parcela-sac',
      titulo: 'Primeira parcela SAC (PMT₁)',
      formula: 'PMT₁ = PV/n + PV×i',
      resultado: valor.toString(),
      passos: [
        passoCalculo(
          'amort',
          'Amortização constante: o principal dividido pelo número de parcelas',
          'A = PV / n',
          `${disp(principal, 2)} / ${n}`,
          amort,
          2,
        ),
        passoCalculo(
          'juros1',
          'Juros do 1º mês, sobre o saldo devedor inicial',
          'J₁ = PV × i',
          `${disp(principal, 2)} × ${disp(i)}`,
          juros,
          2,
        ),
        passoCalculo(
          'pmt1',
          'Somar amortização e juros',
          'PMT₁ = A + J₁',
          `${disp(amort, 2)} + ${disp(juros, 2)}`,
          valor,
          2,
        ),
      ],
    },
  };
}

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
