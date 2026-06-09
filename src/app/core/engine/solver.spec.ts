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

  it('rejeita SAC nesta fase', () => {
    expect(() =>
      resolverCampoAlvo({ sistema: 'sac', parametros: base, campoAlvo: 'parcela' }),
    ).toThrow();
  });
});
