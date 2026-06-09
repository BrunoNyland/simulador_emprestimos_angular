import { Decimal } from './decimal.config';
import { calcularCet, FluxoCaixa } from './cet';
import { valorParcelaPrice } from './price';

const d = (v: string | number) => new Decimal(v);

describe('cet', () => {
  it('pagamento unico: liberado 1000, paga 1100 em t=1 -> 10% a.m.', () => {
    const fluxos: FluxoCaixa[] = [{ periodo: d(1), valor: d(1100) }];
    const r = calcularCet(d(1000), fluxos);
    expect(r.mensal.toDecimalPlaces(8).toString()).toBe('0.1');
    // anual = (1.1)^12 - 1 ~ 2.138428
    expect(r.anual.toDecimalPlaces(6).toString()).toBe('2.138428');
  });

  it('round-trip: CET de uma serie Price (i=1%) ~ 1% (sem encargos)', () => {
    const i = d('0.01');
    const pmt = valorParcelaPrice(d(1000), i, 12); // alta precisao
    const fluxos: FluxoCaixa[] = Array.from({ length: 12 }, (_, k) => ({
      periodo: d(k + 1),
      valor: pmt,
    }));
    const r = calcularCet(d(1000), fluxos);
    expect(r.mensal.toDecimalPlaces(8).toString()).toBe('0.01');
  });

  it('encontra a raiz mesmo com chute inicial distante (usa bissecao)', () => {
    // fluxo com taxa alta
    const fluxos: FluxoCaixa[] = [{ periodo: d(1), valor: d(2000) }];
    const r = calcularCet(d(1000), fluxos);
    expect(r.mensal.toDecimalPlaces(8).toString()).toBe('1'); // 100% a.m.
  });
});
