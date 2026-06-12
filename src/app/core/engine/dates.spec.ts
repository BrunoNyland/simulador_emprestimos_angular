import { adicionarMeses, diasCorridos } from './dates';

describe('dates', () => {
  it('conta dias corridos entre duas datas', () => {
    expect(diasCorridos('2026-01-01', '2026-01-31')).toBe(30);
    expect(diasCorridos('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('adiciona meses mantendo o dia', () => {
    expect(adicionarMeses('2026-01-15', 1)).toBe('2026-02-15');
    expect(adicionarMeses('2026-01-15', 12)).toBe('2027-01-15');
  });

  it('ajusta para o ultimo dia do mes quando o dia nao existe', () => {
    // 2026 nao e bissexto -> fevereiro tem 28 dias
    expect(adicionarMeses('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('trata ano bissexto (2028)', () => {
    expect(diasCorridos('2028-01-01', '2029-01-01')).toBe(366);
    expect(adicionarMeses('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('preserva o dia original ao atravessar um mes curto', () => {
    // 31/01 + 2 meses deve voltar ao dia 31 (marco tem 31 dias)
    expect(adicionarMeses('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('retorna dias negativos quando a data final e anterior', () => {
    expect(diasCorridos('2026-01-31', '2026-01-01')).toBe(-30);
  });

  it('atravessa a virada de ano ao adicionar meses', () => {
    expect(adicionarMeses('2026-11-15', 3)).toBe('2027-02-15');
  });
});
