import { Decimal, arredondarMoeda } from './decimal.config';
import { SistemaAmortizacao } from './models';
import { disp, passoCalculo, TraceCalculo } from './trace';

/** Contexto necessário para explicar UMA linha do cronograma base. */
export interface ContextoLinha {
  sistema: SistemaAmortizacao;
  /** Número da parcela (1..n). */
  numero: number;
  /** Total de parcelas. */
  prazo: number;
  /** Saldo devedor no início do período. */
  saldoInicial: Decimal;
  /** Taxa efetiva do período (mensal). */
  taxaPeriodo: Decimal;
  /** Parcela constante (Price). Obrigatório no Price. */
  pmt?: Decimal;
  /** Amortização constante (SAC). Obrigatório no SAC. */
  amortConstante?: Decimal;
}

/**
 * Reproduz, passo a passo, como UMA linha do cronograma base foi calculada.
 * Espelha exatamente a lógica de gerarCronograma{Price,Sac}: juros sobre o
 * saldo, amortização conforme o sistema, última parcela absorvendo o resíduo.
 * É a mesma fonte de verdade — testado contra as linhas reais geradas.
 */
export function tracarLinhaCronograma(ctx: ContextoLinha): TraceCalculo {
  const { sistema, numero, prazo, saldoInicial, taxaPeriodo: i } = ctx;
  const ultima = numero >= prazo;
  const juros = arredondarMoeda(saldoInicial.times(i));

  let amort: Decimal;
  let descAmort: string;
  let formulaAmort: string;
  let subAmort: string;
  if (ultima) {
    amort = saldoInicial;
    descAmort = 'Última parcela: amortiza todo o saldo devedor restante (absorve o resíduo de centavos)';
    formulaAmort = 'A = saldo inicial';
    subAmort = disp(saldoInicial, 2);
  } else if (sistema === 'price') {
    const pmt = ctx.pmt ?? new Decimal(0);
    amort = pmt.minus(juros);
    descAmort = 'Amortização = parcela constante − juros do mês';
    formulaAmort = 'A = PMT − J';
    subAmort = `${disp(pmt, 2)} − ${disp(juros, 2)}`;
  } else {
    amort = ctx.amortConstante ?? new Decimal(0);
    descAmort = 'Amortização constante do SAC (principal ÷ prazo), igual em todo mês';
    formulaAmort = 'A = PV / n';
    subAmort = disp(amort, 2);
  }

  const valorParcela = arredondarMoeda(amort.plus(juros));
  const saldoFinal = saldoInicial.minus(amort);

  return {
    id: `parcela-linha-${sistema}`,
    titulo: `Parcela ${numero} de ${prazo} — composição`,
    formula: 'Parcela = Juros + Amortização   ·   Juros = Saldo × i   ·   Saldo final = Saldo − Amortização',
    resultado: arredondarMoeda(valorParcela).toString(),
    passos: [
      passoCalculo(
        'juros',
        'Juros do mês: incidem sobre o saldo devedor no início do período',
        'J = Saldo × i',
        `${disp(saldoInicial, 2)} × ${disp(i)}`,
        juros,
        2,
      ),
      passoCalculo('amort', descAmort, formulaAmort, subAmort, arredondarMoeda(amort), 2),
      passoCalculo(
        'parcela',
        'Valor da parcela: juros + amortização',
        'Parcela = J + A',
        `${disp(juros, 2)} + ${disp(arredondarMoeda(amort), 2)}`,
        valorParcela,
        2,
      ),
      passoCalculo(
        'saldoFinal',
        'Saldo devedor ao final do período',
        'Saldo final = Saldo inicial − A',
        `${disp(saldoInicial, 2)} − ${disp(arredondarMoeda(amort), 2)}`,
        saldoFinal,
        2,
      ),
    ],
  };
}
