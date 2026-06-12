import { Decimal } from './decimal.config';
import { calcularIof, ParametrosIof } from './iof';
import { Parcela } from './models';
import { gerarCronogramaPrice } from './price';

const d = (v: string | number) => new Decimal(v);

const paramsPF: ParametrosIof = {
  aliquotaDiaria: d('0.000082'),
  aliquotaAdicional: d('0.0038'),
  limiteDias: 365,
  isento: false,
};

function parcela(amortizacao: string, dataVencimento: string): Parcela {
  return {
    numero: 1,
    dataVencimento,
    saldoInicial: '1000.00',
    juros: '0.00',
    amortizacao,
    encargos: '0.00',
    valorParcela: amortizacao,
    saldoFinal: '0.00',
  };
}

describe('iof', () => {
  it('calcula IOF bullet PF (principal 1000, 30 dias)', () => {
    const r = calcularIof({
      publico: 'PF',
      principal: d(1000),
      parcelas: [parcela('1000.00', '2026-01-31')],
      dataLiberacao: '2026-01-01',
      parametros: paramsPF,
    });
    expect(r.diario.toFixed(2)).toBe('2.46'); // 1000 * 0.000082 * 30
    expect(r.adicional.toFixed(2)).toBe('3.80'); // 1000 * 0.0038
    expect(r.total.toFixed(2)).toBe('6.26');
  });

  it('aplica o teto de 365 dias no IOF diario', () => {
    const r = calcularIof({
      publico: 'PF',
      principal: d(1000),
      parcelas: [parcela('1000.00', '2028-01-01')], // > 365 dias
      dataLiberacao: '2026-01-01',
      parametros: paramsPF,
    });
    // limitado a 365 dias: 1000 * 0.000082 * 365 = 29.93
    expect(r.diario.toFixed(2)).toBe('29.93');
  });

  it('retorna zero quando o produto e isento', () => {
    const r = calcularIof({
      publico: 'PF',
      principal: d(1000),
      parcelas: [parcela('1000.00', '2026-01-31')],
      dataLiberacao: '2026-01-01',
      parametros: { ...paramsPF, isento: true },
    });
    expect(r.total.toString()).toBe('0');
  });

  it('calcula IOF bullet PJ (aliquota diaria 0.000041)', () => {
    const r = calcularIof({
      publico: 'PJ',
      principal: d(1000),
      parcelas: [parcela('1000.00', '2026-01-31')],
      dataLiberacao: '2026-01-01',
      parametros: { ...paramsPF, aliquotaDiaria: d('0.000041') },
    });
    expect(r.diario.toFixed(2)).toBe('1.23'); // 1000 * 0.000041 * 30
    expect(r.adicional.toFixed(2)).toBe('3.80');
    expect(r.total.toFixed(2)).toBe('5.03');
  });

  it('soma o IOF diario por parcela de um cronograma Price real', () => {
    const parcelas = gerarCronogramaPrice({
      principal: d(1000),
      taxaPeriodo: d('0.01'),
      prazo: 3,
      dataBase: '2026-01-01',
    });
    // amortizacoes 330.02 / 333.32 / 336.66 com 31 / 59 / 90 dias corridos
    const r = calcularIof({
      publico: 'PF',
      principal: d(1000),
      parcelas,
      dataLiberacao: '2026-01-01',
      parametros: paramsPF,
    });
    // 0.000082 * (330.02*31 + 333.32*59 + 336.66*90) = 4.9361
    expect(r.diario.toFixed(2)).toBe('4.94');
    expect(r.adicional.toFixed(2)).toBe('3.80');
    expect(r.total.toFixed(2)).toBe('8.74');
  });

  it('aplica o teto apenas nas parcelas que excedem 365 dias', () => {
    const p1 = { ...parcela('500.00', '2026-07-01'), numero: 1 }; // 181 dias
    const p2 = { ...parcela('500.00', '2028-01-01'), numero: 2 }; // 730 dias -> 365
    const r = calcularIof({
      publico: 'PF',
      principal: d(1000),
      parcelas: [p1, p2],
      dataLiberacao: '2026-01-01',
      parametros: paramsPF,
    });
    // 0.000082 * 500 * (181 + 365) = 22.386
    expect(r.diario.toFixed(2)).toBe('22.39');
  });
});
