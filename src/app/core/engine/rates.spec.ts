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

  it('mensalParaUnidade converte efetiva mensal para anual', () => {
    expect(mensalParaUnidade(d('0.01'), 'efetiva', 'anual').toDecimalPlaces(6).toString()).toBe(
      '0.126825',
    );
  });

  it('taxa de periodo irregular: extremos (0 dias e periodo cheio)', () => {
    expect(taxaPeriodoIrregular(d('0.01'), 0, 30, 'composta').toString()).toBe('0');
    expect(taxaPeriodoIrregular(d('0.01'), 0, 30, 'linear').toString()).toBe('0');
    // dias = periodo cheio -> taxa integral nos dois modos
    expect(taxaPeriodoIrregular(d('0.01'), 30, 30, 'composta').toDecimalPlaces(10).toString()).toBe(
      '0.01',
    );
    expect(taxaPeriodoIrregular(d('0.01'), 30, 30, 'linear').toString()).toBe('0.01');
  });

  it('taxa zero permanece zero em todas as conversoes', () => {
    expect(taxaEfetivaMensal(d(0), 'efetiva', 'anual').toString()).toBe('0');
    expect(taxaEfetivaMensal(d(0), 'nominal', 'anual').toString()).toBe('0');
    expect(efetivaMensalParaAnual(d(0)).toString()).toBe('0');
  });
});
