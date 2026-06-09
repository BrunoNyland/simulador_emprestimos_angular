import { Decimal } from './decimal.config';
import {
  efetivaAnualParaMensal,
  efetivaMensalParaAnual,
  mensalParaUnidade,
  nominalAnualParaMensal,
  taxaEfetivaMensal,
  taxaPeriodoIrregular,
} from './rates';

const d = (v: string | number) => new Decimal(v);

describe('rates', () => {
  it('converte efetiva mensal <-> anual (round-trip)', () => {
    const anual = efetivaMensalParaAnual(d('0.01'));
    expect(anual.toDecimalPlaces(6).toString()).toBe('0.126825');
    expect(efetivaAnualParaMensal(anual).toDecimalPlaces(6).toString()).toBe('0.01');
  });

  it('converte nominal anual para mensal', () => {
    expect(nominalAnualParaMensal(d('0.12')).toString()).toBe('0.01');
  });

  it('normaliza taxa para efetiva mensal conforme tipo/unidade', () => {
    expect(taxaEfetivaMensal(d('0.01'), 'efetiva', 'mensal').toString()).toBe('0.01');
    expect(taxaEfetivaMensal(d('0.12'), 'nominal', 'anual').toString()).toBe('0.01');
    expect(
      taxaEfetivaMensal(d('0.126825030131969720661201').plus(0), 'efetiva', 'anual')
        .toDecimalPlaces(6)
        .toString(),
    ).toBe('0.01');
  });

  it('mensalParaUnidade inverte a normalizacao', () => {
    expect(mensalParaUnidade(d('0.01'), 'efetiva', 'mensal').toString()).toBe('0.01');
    expect(mensalParaUnidade(d('0.01'), 'nominal', 'anual').toString()).toBe('0.12');
  });

  it('calcula taxa de periodo irregular (composta e linear)', () => {
    expect(taxaPeriodoIrregular(d('0.01'), 15, 30, 'linear').toString()).toBe('0.005');
    expect(taxaPeriodoIrregular(d('0.01'), 15, 30, 'composta').toDecimalPlaces(6).toString()).toBe(
      '0.004988',
    );
  });
});
