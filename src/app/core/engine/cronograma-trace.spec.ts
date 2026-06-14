import { Decimal, arredondarMoeda } from './decimal.config';
import { gerarCronogramaPrice, valorParcelaPrice } from './price';
import { gerarCronogramaSac } from './sac';
import { tracarLinhaCronograma } from './cronograma-trace';

const d = (v: string | number) => new Decimal(v);

/** Lê o resultado final de um passo do traço (string Decimal -> 2 casas). */
function passo(trace: ReturnType<typeof tracarLinhaCronograma>, id: string): string {
  return arredondarMoeda(new Decimal(trace.passos.find((p) => p.id === id)!.resultado ?? '0')).toFixed(2);
}

describe('traço por linha do cronograma (fonte única)', () => {
  it('Price: cada linha do traço reproduz juros/amort/parcela/saldo reais', () => {
    const principal = d(1000);
    const i = d('0.01');
    const n = 12;
    const parcelas = gerarCronogramaPrice({ principal, taxaPeriodo: i, prazo: n });
    const pmt = arredondarMoeda(valorParcelaPrice(principal, i, n));

    for (const p of parcelas) {
      const trace = tracarLinhaCronograma({
        sistema: 'price',
        numero: p.numero,
        prazo: n,
        saldoInicial: new Decimal(p.saldoInicial),
        taxaPeriodo: i,
        pmt,
      });
      expect(passo(trace, 'juros'), `juros parc ${p.numero}`).toBe(p.juros);
      expect(passo(trace, 'amort'), `amort parc ${p.numero}`).toBe(p.amortizacao);
      expect(passo(trace, 'parcela'), `parcela ${p.numero}`).toBe(p.valorParcela);
      expect(passo(trace, 'saldoFinal'), `saldo parc ${p.numero}`).toBe(p.saldoFinal);
    }
  });

  it('SAC: cada linha do traço reproduz juros/amort/parcela/saldo reais', () => {
    const principal = d(1000);
    const i = d('0.01');
    const n = 12;
    const parcelas = gerarCronogramaSac({ principal, taxaPeriodo: i, prazo: n });
    const amortConstante = arredondarMoeda(principal.div(n));

    for (const p of parcelas) {
      const trace = tracarLinhaCronograma({
        sistema: 'sac',
        numero: p.numero,
        prazo: n,
        saldoInicial: new Decimal(p.saldoInicial),
        taxaPeriodo: i,
        amortConstante,
      });
      expect(passo(trace, 'juros'), `juros parc ${p.numero}`).toBe(p.juros);
      expect(passo(trace, 'amort'), `amort parc ${p.numero}`).toBe(p.amortizacao);
      expect(passo(trace, 'parcela'), `parcela ${p.numero}`).toBe(p.valorParcela);
      expect(passo(trace, 'saldoFinal'), `saldo parc ${p.numero}`).toBe(p.saldoFinal);
    }
  });

  it('última parcela: amortiza todo o saldo restante', () => {
    const trace = tracarLinhaCronograma({
      sistema: 'price',
      numero: 12,
      prazo: 12,
      saldoInicial: d('87.96'),
      taxaPeriodo: d('0.01'),
      pmt: d('88.85'),
    });
    expect(trace.passos.find((p) => p.id === 'amort')!.descricao).toContain('Última parcela');
    expect(passo(trace, 'saldoFinal')).toBe('0.00');
  });
});
