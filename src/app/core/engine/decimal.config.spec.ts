import { Decimal, arredondarMoeda } from './decimal.config';

describe('decimal.config', () => {
  it('nao sofre erro de ponto flutuante (0.1 + 0.2 === 0.3)', () => {
    expect(new Decimal('0.1').plus('0.2').toString()).toBe('0.3');
  });

  it('arredonda para moeda usando half-even (bancario)', () => {
    // 2.345 esta exatamente no meio -> arredonda para o par mais proximo (2.34)
    expect(arredondarMoeda('2.345').toString()).toBe('2.34');
    // 2.355 esta exatamente no meio -> arredonda para o par mais proximo (2.36)
    expect(arredondarMoeda('2.355').toString()).toBe('2.36');
  });

  it('mantem exatidao em somas monetarias repetidas (onde o float falha)', () => {
    // Em number nativo, somar 0.1 dez vezes resulta em 0.9999999999999999.
    let soma = new Decimal(0);
    for (let k = 0; k < 10; k++) {
      soma = soma.plus('0.1');
    }
    expect(soma.toString()).toBe('1');
  });
});
