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
    expect(exp!.formula).toContain('PV = PMT');
    expect(exp!.regras.some(r => r.includes('Half-Up'))).toBe(true);
  });

  it('deve retornar a explicacao para Taxa de Juros', () => {
    const exp = obterExplicacaoMatematica('taxa', dadosBase, 'price', 'half-even');
    expect(exp).not.toBeNull();
    expect(exp!.titulo).toContain('Taxa de Juros');
    expect(exp!.formula).toContain('PV = Σ');
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

  it('inclui instrucoes de HP12C e Excel em todos os topicos base', () => {
    const topicos = [
      'parcela',
      'valorBruto',
      'taxa',
      'prazo',
      'valorLiquido',
      'iof',
      'iofDiario',
      'iofAdicional',
      'totalPago',
      'totalJuros',
      'cetMensal',
    ];
    for (const t of topicos) {
      const exp = obterExplicacaoMatematica(t, dadosBase, 'price', 'half-even');
      expect(exp, `topico ${t}`).not.toBeNull();
      expect(exp!.hp12c.length, `hp12c de ${t}`).toBeGreaterThan(0);
      expect(exp!.excel.length, `excel de ${t}`).toBeGreaterThan(0);
      expect(exp!.normas.length, `normas de ${t}`).toBeGreaterThan(0);
    }
  });

  it('todos os topicos (base e pos-eventos, Price e SAC) entregam MathML valido', () => {
    const dadosEventos = {
      ...dadosBase,
      resumo: {
        prazoFinal: 10,
        economiaJuros: '120.00',
        amortizacoesExtras: '500.00',
        totalEncargos: '18.91',
      },
      totaisOriginal: dadosBase.totais,
    };
    const topicos = [
      'parcela', 'valorBruto', 'taxa', 'prazo', 'valorLiquido',
      'iof', 'iofDiario', 'iofAdicional', 'totalPago', 'totalJuros', 'cetMensal', 'cetAnual',
      'prazoFinal', 'economiaJuros', 'amortizacoesExtras', 'moraEncargos', 'totalPagoPos', 'cetMensalPos',
    ];
    for (const sistema of ['price', 'sac'] as const) {
      for (const t of topicos) {
        const exp = obterExplicacaoMatematica(t, dadosEventos, sistema, 'half-even');
        expect(exp, `${t}/${sistema}`).not.toBeNull();
        // MathML presente e balanceado
        expect(exp!.formulaMathML, `mathml de ${t}/${sistema}`).toContain('<math');
        expect(exp!.formulaMathML).toContain('</math>');
        const abre = (exp!.formulaMathML.match(/<math/g) || []).length;
        const fecha = (exp!.formulaMathML.match(/<\/math>/g) || []).length;
        expect(abre, `tags math balanceadas em ${t}/${sistema}`).toBe(fecha);
      }
    }
  });

  it('cada variavel da legenda tem cor correspondente (classe fx-v{i}) na formula MathML', () => {
    // a UI colore a legenda por indice; a formula deve referenciar as mesmas classes
    const exp = obterExplicacaoMatematica('parcela', dadosBase, 'price', 'half-even');
    for (let i = 0; i < exp!.legenda.length; i++) {
      expect(exp!.formulaMathML, `fx-v${i} presente`).toContain(`fx-v${i}`);
    }
  });

  it('HP12C da parcela Price usa os registradores financeiros (PV, i, n, PMT)', () => {
    const exp = obterExplicacaoMatematica('parcela', dadosBase, 'price', 'half-even');
    const teclas = exp!.hp12c.join(' ');
    expect(teclas).toContain('CHS PV');
    expect(teclas).toContain('PMT');
  });

  it('Excel da parcela Price usa a funcao PGTO', () => {
    const exp = obterExplicacaoMatematica('parcela', dadosBase, 'price', 'half-even');
    expect(exp!.excel.some((l) => l.includes('=PGTO('))).toBe(true);
  });

  it('CET cita a Resolucao CMN 4.881/2020 com link para o BACEN', () => {
    const exp = obterExplicacaoMatematica('cetMensal', dadosBase, 'price', 'half-even');
    const norma = exp!.normas.find((nr) => nr.rotulo.includes('4.881'));
    expect(norma).toBeDefined();
    expect(norma!.url).toContain('bcb.gov.br');
  });

  it('IOF cita o Decreto 6.306/2007 com link para o Planalto', () => {
    for (const t of ['iof', 'iofDiario', 'iofAdicional']) {
      const exp = obterExplicacaoMatematica(t, dadosBase, 'price', 'half-even');
      const norma = exp!.normas.find((nr) => nr.rotulo.includes('6.306'));
      expect(norma, `norma de ${t}`).toBeDefined();
      expect(norma!.url).toContain('planalto.gov.br');
    }
  });

  it('mora cita o limite de 2% do CDC (art. 52, § 1º)', () => {
    const dadosEventos = {
      ...dadosBase,
      resumo: { totalEncargos: '18.91', prazoFinal: 12, economiaJuros: '0', amortizacoesExtras: '0' },
    };
    const exp = obterExplicacaoMatematica('moraEncargos', dadosEventos, 'price', 'half-even');
    expect(exp).not.toBeNull();
    expect(exp!.normas.some((nr) => nr.rotulo.includes('8.078') && nr.rotulo.includes('52'))).toBe(true);
  });

  it('CET pos-eventos orienta o uso de XTIR no Excel (dias/365)', () => {
    const dadosEventos = {
      ...dadosBase,
      resumo: { totalEncargos: '0', prazoFinal: 10, economiaJuros: '100', amortizacoesExtras: '500' },
    };
    const exp = obterExplicacaoMatematica('cetMensalPos', dadosEventos, 'price', 'half-even');
    expect(exp).not.toBeNull();
    expect(exp!.excel.some((l) => l.includes('XTIR'))).toBe(true);
  });

  // --- Mini-cronograma (suggestion 4) ---
  // a taxa no motor e fracao (0.02 = 2% a.m.); dadosBase usa '2' so para campos nao calculados
  const dadosReais = { ...dadosBase, parametros: { ...dadosBase.parametros, taxa: '0.02' } };

  it('Parcela Price traz mini-cronograma com 3 linhas coerentes (juros + amort = parcela)', () => {
    const exp = obterExplicacaoMatematica('parcela', dadosReais, 'price', 'half-even');
    const demo = exp!.demonstracaoCronograma;
    expect(demo).toBeDefined();
    expect(demo!.linhas).toHaveLength(3);
    // 1a linha: saldo inicial = PV; juros = 10000*0.02 = 200,00
    const l1 = demo!.linhas[0];
    expect(l1.parcela).toBe('1');
    expect(l1.juros).toContain('200,00');
    expect(l1.valorParcela).toContain('945,60');
    // parcela Price constante nas 3 linhas
    expect(demo!.linhas.every((l) => l.valorParcela === l1.valorParcela)).toBe(true);
  });

  it('Parcela SAC traz mini-cronograma com amortizacao constante e parcela decrescente', () => {
    const exp = obterExplicacaoMatematica('parcela', dadosReais, 'sac', 'half-even');
    const demo = exp!.demonstracaoCronograma;
    expect(demo).toBeDefined();
    // amortizacao = 10000/12 = 833,33 constante
    expect(demo!.linhas.every((l) => l.amortizacao === demo!.linhas[0].amortizacao)).toBe(true);
    // parcela decresce (juros caem)
    const p0 = Number(demo!.linhas[0].valorParcela.replace(/[^\d,]/g, '').replace(',', '.'));
    const p1 = Number(demo!.linhas[1].valorParcela.replace(/[^\d,]/g, '').replace(',', '.'));
    expect(p1).toBeLessThan(p0);
  });

  it('topicos que nao sao parcela NAO trazem mini-cronograma', () => {
    for (const t of ['valorLiquido', 'iof', 'cetMensal', 'totalJuros']) {
      const exp = obterExplicacaoMatematica(t, dadosBase, 'price', 'half-even');
      expect(exp!.demonstracaoCronograma, `sem cronograma em ${t}`).toBeUndefined();
    }
  });

  // --- Glossário e links cruzados (suggestion 5) ---
  it('todos os topicos trazem glossario e links relacionados validos', () => {
    const dadosEventos = {
      ...dadosBase,
      resumo: { prazoFinal: 10, economiaJuros: '120.00', amortizacoesExtras: '500.00', totalEncargos: '18.91' },
      totaisOriginal: dadosBase.totais,
    };
    const topicos = [
      'parcela', 'valorBruto', 'taxa', 'prazo', 'valorLiquido',
      'iof', 'iofDiario', 'iofAdicional', 'totalPago', 'totalJuros', 'cetMensal', 'cetAnual',
      'prazoFinal', 'economiaJuros', 'amortizacoesExtras', 'moraEncargos', 'totalPagoPos', 'cetMensalPos',
    ];
    for (const t of topicos) {
      const exp = obterExplicacaoMatematica(t, dadosEventos, 'price', 'half-even');
      expect(exp!.glossario!.length, `glossario de ${t}`).toBeGreaterThan(0);
      expect(exp!.relacionados!.length, `relacionados de ${t}`).toBeGreaterThan(0);
      for (const rel of exp!.relacionados!) {
        // cada link cruzado deve apontar para um topico que existe de fato
        const alvo = obterExplicacaoMatematica(rel.topico, dadosEventos, 'price', 'half-even');
        expect(alvo, `link ${t} -> ${rel.topico}`).not.toBeNull();
      }
    }
  });
});
