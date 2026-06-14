import { Decimal } from './decimal.config';
import { calcularParcelaPrice, valorParcelaPrice } from './price';
import { calcularPrimeiraParcelaSac } from './sac';

const d = (v: string | number) => new Decimal(v);

describe('traço de cálculo (fonte única motor ↔ explicação)', () => {
  it('Price: o valor do traço é idêntico ao de valorParcelaPrice', () => {
    const r = calcularParcelaPrice(d(1000), d('0.01'), 12);
    expect(r.valor.toString()).toBe(valorParcelaPrice(d(1000), d('0.01'), 12).toString());
    // o resultado final do traço é o mesmo valor
    expect(r.trace.resultado).toBe(r.valor.toString());
  });

  it('Price: passos têm ids estáveis e o último passo é o PMT final', () => {
    const r = calcularParcelaPrice(d(1000), d('0.01'), 12);
    expect(r.trace.id).toBe('parcela-price');
    expect(r.trace.passos.map((p) => p.id)).toEqual(['base', 'pot', 'denom', 'fator', 'pmt']);
    const ultimo = r.trace.passos.at(-1)!;
    expect(ultimo.resultado).toBe(r.valor.toString());
  });

  it('Price: cada passo tem resultado em alta precisão consistente com o anterior', () => {
    const r = calcularParcelaPrice(d(1000), d('0.01'), 12);
    const passo = (id: string) => new Decimal(r.trace.passos.find((p) => p.id === id)!.resultado ?? '0');
    // base = 1 + i
    expect(passo('base').toString()).toBe('1.01');
    // denom = 1 - pot
    expect(passo('denom').toString()).toBe(new Decimal(1).minus(passo('pot')).toString());
    // fator = i / denom
    expect(passo('fator').toString()).toBe(d('0.01').div(passo('denom')).toString());
    // pmt = PV * fator
    expect(passo('pmt').toString()).toBe(d(1000).times(passo('fator')).toString());
  });

  it('Price taxa zero: traço de um passo só (PV / n)', () => {
    const r = calcularParcelaPrice(d(1200), d(0), 12);
    expect(r.valor.toString()).toBe('100');
    expect(r.trace.passos).toHaveLength(1);
    expect(r.trace.passos[0].id).toBe('div');
  });

  it('SAC: 1ª parcela = PV/n + PV·i e traço com ids amort/juros1/pmt1', () => {
    const r = calcularPrimeiraParcelaSac(d(1000), d('0.01'), 12);
    // 1000/12 + 1000*0.01 = 83.3333... + 10
    expect(r.valor.toDecimalPlaces(4).toString()).toBe('93.3333');
    expect(r.trace.id).toBe('parcela-sac');
    expect(r.trace.passos.map((p) => p.id)).toEqual(['amort', 'juros1', 'pmt1']);
    expect(r.trace.passos.at(-1)!.resultado).toBe(r.valor.toString());
  });

  it('rejeita prazo <= 0 em ambos os sistemas', () => {
    expect(() => calcularParcelaPrice(d(1000), d('0.01'), 0)).toThrow();
    expect(() => calcularPrimeiraParcelaSac(d(1000), d('0.01'), 0)).toThrow();
  });
});
