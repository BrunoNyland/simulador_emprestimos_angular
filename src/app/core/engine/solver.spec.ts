import { Decimal } from './decimal.config';
import { valorParcelaPrice } from './price';
import { resolverCampoAlvo } from './solver';
import { ParametrosSimulacao } from './models';

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
});
