import { obterExplicacaoMatematica } from './explicador';

describe('explicador', () => {
  const dadosBase = {
    parametros: {
      valorBruto: '10000',
      taxa: '2',
      tipoTaxa: 'efetiva',
      unidadeTaxa: 'mensal',
      prazo: 12
    },
    parcelaCalculada: '945.60',
    valorLiquido: '9520.00',
    iof: '380.00',
    totais: {
      totalParcelas: '11347.20',
      totalJuros: '1347.20'
    },
    cetMensal: '0.025',
    cetAnual: '0.344',
    memoriaCalculo: {
      iofDiario: '342.00',
      iofAdicional: '38.00'
    }
  };

  it('deve retornar a explicacao para Parcela no Price', () => {
    const exp = obterExplicacaoMatematica('parcela', dadosBase, 'price', 'half-even');
    expect(exp).not.toBeNull();
    expect(exp!.titulo).toContain('Sistema Price');
    expect(exp!.formula).toContain('PMT = PV');
    expect(exp!.legenda.length).toBe(4);
    expect(exp!.passos.length).toBeGreaterThan(0);
    expect(exp!.regras.some(r => r.includes('Half-Even'))).toBe(true);
  });

  it('deve retornar a explicacao para Parcela no SAC', () => {
    const exp = obterExplicacaoMatematica('parcela', dadosBase, 'sac', 'half-even');
    expect(exp).not.toBeNull();
    expect(exp!.titulo).toContain('Sistema SAC');
    expect(exp!.formula).toContain('PMT_k = A + J_k');
  });

  it('deve retornar a explicacao para Valor Bruto no Price', () => {
    const exp = obterExplicacaoMatematica('valorBruto', dadosBase, 'price', 'half-up');
    expect(exp).not.toBeNull();
    expect(exp!.formula).toContain('PV = PMT /');
    expect(exp!.regras.some(r => r.includes('Half-Up'))).toBe(true);
  });

  it('deve retornar a explicacao para Taxa de Juros', () => {
    const exp = obterExplicacaoMatematica('taxa', dadosBase, 'price', 'half-even');
    expect(exp).not.toBeNull();
    expect(exp!.titulo).toContain('Taxa de Juros');
    expect(exp!.formula).toContain('f(i) = PV');
  });

  it('deve retornar a explicacao para Valor Liquido', () => {
    const exp = obterExplicacaoMatematica('valorLiquido', dadosBase, 'price', 'half-even');
    expect(exp).not.toBeNull();
    expect(exp!.formula).toContain('Líquido = Bruto');
  });

  it('deve retornar a explicacao para CET', () => {
    const exp = obterExplicacaoMatematica('cetMensal', dadosBase, 'price', 'half-even');
    expect(exp).not.toBeNull();
    expect(exp!.titulo).toContain('CET');
  });

  it('deve retornar null se o topico nao existir', () => {
    const exp = obterExplicacaoMatematica('topico_inexistente', dadosBase, 'price', 'half-even');
    expect(exp).toBeNull();
  });
});
