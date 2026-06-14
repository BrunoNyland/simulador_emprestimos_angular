import { Decimal } from './decimal.config';
import { valorParcelaPrice } from './price';
import {
  resolverCampoAlvo,
  calcularValorPresentePrice,
  valorPresentePrice,
  calcularValorPresenteSac,
  valorPresenteSac,
  calcularPrazoPrice,
  prazoPrice,
  calcularPrazoSac,
  prazoSac,
} from './solver';
import { ParametrosSimulacao } from './models';

const d = (v: string | number) => new Decimal(v);

describe('solver — traços (motor = fonte única)', () => {
  it('PV Price: traço bate com valorPresentePrice e tem ids esperados', () => {
    const r = calcularValorPresentePrice(d('88.848'), d('0.01'), 12);
    expect(r.valor.toString()).toBe(valorPresentePrice(d('88.848'), d('0.01'), 12).toString());
    expect(r.trace.id).toBe('pv-price');
    expect(r.trace.passos.map((p) => p.id)).toEqual(['base', 'pot', 'num', 'fator', 'pv']);
    expect(r.trace.passos.at(-1)!.resultado).toBe(r.valor.toString());
  });

  it('PV SAC: traço bate com valorPresenteSac', () => {
    const r = calcularValorPresenteSac(d('93.333333'), d('0.01'), 12);
    expect(r.valor.toString()).toBe(valorPresenteSac(d('93.333333'), d('0.01'), 12).toString());
    expect(r.trace.passos.map((p) => p.id)).toEqual(['cota', 'fator', 'pv']);
  });

  it('Prazo Price: n inteiro bate com prazoPrice e o traço guarda o n exato', () => {
    const pmt = valorParcelaPrice(d(1000), d('0.01'), 12);
    const r = calcularPrazoPrice(d(1000), pmt, d('0.01'));
    expect(r.n).toBe(prazoPrice(d(1000), pmt, d('0.01')));
    expect(r.n).toBe(12);
    expect(new Decimal(r.trace.resultado).toDecimalPlaces(4).toString()).toBe('12');
    expect(r.trace.passos.map((p) => p.id)).toEqual(['juros', 'frac', 'arg', 'lnArg', 'lnBase', 'n']);
  });

  it('Prazo SAC: n inteiro bate com prazoSac', () => {
    const r = calcularPrazoSac(d(1000), d('93.333333'), d('0.01'));
    expect(r.n).toBe(prazoSac(d(1000), d('93.333333'), d('0.01')));
    expect(r.trace.passos.map((p) => p.id)).toEqual(['juros', 'amort', 'n']);
  });

  it('Prazo Price rejeita parcela <= juros (prazo infinito)', () => {
    expect(() => calcularPrazoPrice(d(1000), d('10'), d('0.01'))).toThrow();
  });
});

const base: ParametrosSimulacao = {
  valorBruto: '1000',
  valorLiquido: '1000',
  taxa: '0.01',
  tipoTaxa: 'efetiva',
  unidadeTaxa: 'mensal',
  prazo: 12,
};

// PMT exato (alta precisao) p/ os alvos inversos
const pmtExato = valorParcelaPrice(new Decimal(1000), new Decimal('0.01'), 12);

describe('solver (Price)', () => {
  it('alvo=parcela: resolve PMT', () => {
    const r = resolverCampoAlvo({ sistema: 'price', parametros: base, campoAlvo: 'parcela' });
    expect(r.parcela).toBe('88.85');
  });

  it('alvo=valorBruto: PV a partir de PMT,i,n', () => {
    const r = resolverCampoAlvo({
      sistema: 'price',
      parametros: base,
      parcela: pmtExato.toString(),
      campoAlvo: 'valorBruto',
    });
    expect(r.parametros.valorBruto).toBe('1000.00');
  });

  it('alvo=prazo: n a partir de PV,PMT,i', () => {
    const r = resolverCampoAlvo({
      sistema: 'price',
      parametros: base,
      parcela: pmtExato.toString(),
      campoAlvo: 'prazo',
    });
    expect(r.parametros.prazo).toBe(12);
  });

  it('alvo=taxa: i a partir de PV,PMT,n', () => {
    const r = resolverCampoAlvo({
      sistema: 'price',
      parametros: base,
      parcela: pmtExato.toString(),
      campoAlvo: 'taxa',
    });
    expect(new Decimal(r.parametros.taxa).toDecimalPlaces(6).toString()).toBe('0.01');
  });

  it('exige parcela para alvos inversos', () => {
    expect(() =>
      resolverCampoAlvo({ sistema: 'price', parametros: base, campoAlvo: 'taxa' }),
    ).toThrow();
  });

  it('taxa zero: PMT = PV/n e prazo = PV/PMT', () => {
    const semJuros: ParametrosSimulacao = { ...base, taxa: '0' };
    const r = resolverCampoAlvo({ sistema: 'price', parametros: semJuros, campoAlvo: 'parcela' });
    expect(r.parcela).toBe('83.33');

    const rPrazo = resolverCampoAlvo({
      sistema: 'price',
      parametros: semJuros,
      parcela: '100',
      campoAlvo: 'prazo',
    });
    expect(rPrazo.parametros.prazo).toBe(10);
  });

  it('alvo=prazo: rejeita parcela que nao cobre os juros (prazo infinito)', () => {
    // PV*i = 10; PMT = 10 nunca amortiza
    expect(() =>
      resolverCampoAlvo({ sistema: 'price', parametros: base, parcela: '10', campoAlvo: 'prazo' }),
    ).toThrow();
  });

  it('alvo=taxa: rejeita parcela menor que PV/n (taxa negativa)', () => {
    expect(() =>
      resolverCampoAlvo({ sistema: 'price', parametros: base, parcela: '80', campoAlvo: 'taxa' }),
    ).toThrow();
  });

  it('rejeita sistema de amortizacao desconhecido', () => {
    expect(() =>
      resolverCampoAlvo({
        sistema: 'americano' as never,
        parametros: base,
        campoAlvo: 'parcela',
      }),
    ).toThrow();
  });
});

describe('solver (SAC)', () => {
  // SAC: 1a parcela = PV/n + PV*i = 1000/12 + 1000*0.01 = 83.3333 + 10 = 93.3333
  it('alvo=parcela: resolve a 1a parcela', () => {
    const r = resolverCampoAlvo({ sistema: 'sac', parametros: base, campoAlvo: 'parcela' });
    expect(r.parcela).toBe('93.33');
  });

  it('alvo=valorBruto: PV a partir da 1a parcela, i, n', () => {
    const r = resolverCampoAlvo({
      sistema: 'sac',
      parametros: base,
      parcela: '93.333333',
      campoAlvo: 'valorBruto',
    });
    expect(r.parametros.valorBruto).toBe('1000.00');
  });

  it('alvo=prazo: n a partir de PV, 1a parcela, i', () => {
    const r = resolverCampoAlvo({
      sistema: 'sac',
      parametros: base,
      parcela: '93.333333',
      campoAlvo: 'prazo',
    });
    expect(r.parametros.prazo).toBe(12);
  });

  it('alvo=taxa: i a partir de PV, 1a parcela, n', () => {
    const r = resolverCampoAlvo({
      sistema: 'sac',
      parametros: base,
      parcela: '93.333333',
      campoAlvo: 'taxa',
    });
    expect(new Decimal(r.parametros.taxa).toDecimalPlaces(6).toString()).toBe('0.01');
  });

  it('alvo=prazo: rejeita 1a parcela que nao cobre os juros', () => {
    // PV*i = 10; parcela1 = 10 -> denominador zero
    expect(() =>
      resolverCampoAlvo({ sistema: 'sac', parametros: base, parcela: '10', campoAlvo: 'prazo' }),
    ).toThrow();
  });

  it('alvo=taxa: rejeita 1a parcela menor que a amortizacao (PV/n)', () => {
    expect(() =>
      resolverCampoAlvo({ sistema: 'sac', parametros: base, parcela: '80', campoAlvo: 'taxa' }),
    ).toThrow();
  });
});
