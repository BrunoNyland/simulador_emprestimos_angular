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
});
