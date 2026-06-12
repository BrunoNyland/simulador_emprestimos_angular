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

  it('tarifa deduzida do liberado eleva o CET acima da taxa do contrato', () => {
    // contrato a 1% a.m., mas o cliente recebe 950 (tarifa de 50)
    const pmt = valorParcelaPrice(d(1000), d('0.01'), 12);
    const fluxos: FluxoCaixa[] = Array.from({ length: 12 }, (_, k) => ({
      periodo: d(k + 1),
      valor: pmt,
    }));
    const r = calcularCet(d(950), fluxos);
    expect(r.mensal.greaterThan('0.01')).toBe(true);
    expect(r.mensal.lessThan('0.025')).toBe(true);
  });

  it('modo BACEN (periodosAno=1): TIR e anual, mensal derivada por (1+i)^(1/12)', () => {
    // liberado 1000, paga 1100 em exatamente 1 ano (periodo = 365/365)
    const fluxos: FluxoCaixa[] = [{ periodo: d(1), valor: d(1100) }];
    const r = calcularCet(d(1000), fluxos, { periodosAno: 1 });
    expect(r.anual.toDecimalPlaces(8).toString()).toBe('0.1');
    expect(r.mensal.toDecimalPlaces(6).toString()).toBe('0.007974');
  });

  it('fluxo sem custo: CET zero', () => {
    // liberado 1200, paga 12x100 sem juros
    const fluxos: FluxoCaixa[] = Array.from({ length: 12 }, (_, k) => ({
      periodo: d(k + 1),
      valor: d(100),
    }));
    const r = calcularCet(d(1200), fluxos);
    expect(r.mensal.abs().lessThan('1e-6')).toBe(true);
  });
});
