import { Decimal } from './decimal.config';
import { brutoParaLiquido, calcularEncargo, liquidoParaBruto } from './encargos';
import { Encargo } from './models';

const d = (v: string | number) => new Decimal(v);

const fixo50: Encargo = {
  nome: 'Tarifa',
  tipo: 'fixo',
  valor: '50',
  deduzidoDoLiquido: true,
  incideNoCet: true,
};

const pct2: Encargo = {
  nome: 'IOF aprox.',
  tipo: 'percentual-principal',
  valor: '0.02',
  deduzidoDoLiquido: true,
  incideNoCet: true,
};

describe('encargos', () => {
  it('encargo fixo: bruto -> liquido e liquido -> bruto (round-trip)', () => {
    expect(brutoParaLiquido(d(1000), [fixo50], 12).toString()).toBe('950');
    expect(liquidoParaBruto(d(950), [fixo50], 12).toString()).toBe('1000');
  });

  it('encargo percentual do bruto: resolve a relacao circular', () => {
    // liquido = bruto*(1-0.02) = bruto*0.98
    expect(brutoParaLiquido(d(1000), [pct2], 12).toString()).toBe('980');
    expect(liquidoParaBruto(d(980), [pct2], 12).toString()).toBe('1000');
  });

  it('combina fixo + percentual', () => {
    // bruto=1000 -> liquido = 1000*0.98 - 50 = 930
    expect(brutoParaLiquido(d(1000), [fixo50, pct2], 12).toString()).toBe('930');
    expect(liquidoParaBruto(d(930), [fixo50, pct2], 12).toString()).toBe('1000');
  });

  it('rejeita encargos percentuais >= 100% do bruto', () => {
    const pct100: Encargo = { ...pct2, valor: '1' };
    expect(() => liquidoParaBruto(d(900), [pct100], 12)).toThrow();
  });

  it('calcularEncargo cobre todos os tipos', () => {
    const principal = d(1000);
    expect(calcularEncargo({ ...fixo50, tipo: 'unico' }, principal, 12).toString()).toBe('50');
    expect(
      calcularEncargo({ ...fixo50, tipo: 'por-periodo', valor: '2' }, principal, 12).toString(),
    ).toBe('24');
    expect(
      calcularEncargo({ ...fixo50, tipo: 'percentual-ap', valor: '0.005' }, principal, 12).toString(),
    ).toBe('60'); // 1000 * 0.005 * 12
    expect(
      calcularEncargo({ ...fixo50, tipo: 'percentual-principal', valor: '0.02' }, principal, 12).toString(),
    ).toBe('20');
  });

  it('ignora encargos nao deduzidos do liquido', () => {
    const financiado: Encargo = { ...fixo50, deduzidoDoLiquido: false };
    expect(brutoParaLiquido(d(1000), [financiado], 12).toString()).toBe('1000');
    expect(liquidoParaBruto(d(1000), [financiado], 12).toString()).toBe('1000');
  });

  it('encargo por-periodo: round-trip liquido <-> bruto', () => {
    const porPeriodo: Encargo = { ...fixo50, tipo: 'por-periodo', valor: '2' };
    expect(brutoParaLiquido(d(1000), [porPeriodo], 12).toString()).toBe('976');
    expect(liquidoParaBruto(d(976), [porPeriodo], 12).toString()).toBe('1000');
  });

  it('encargo percentual a.p.: round-trip liquido <-> bruto', () => {
    const ap: Encargo = { ...fixo50, tipo: 'percentual-ap', valor: '0.005' };
    // liquido = bruto * (1 - 0.005*12) = bruto * 0.94
    expect(brutoParaLiquido(d(1000), [ap], 12).toString()).toBe('940');
    expect(liquidoParaBruto(d(940), [ap], 12).toString()).toBe('1000');
  });
});
