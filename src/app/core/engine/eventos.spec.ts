import { Decimal } from './decimal.config';
import { EntradaProjecao, projetarComEventos } from './eventos';
import { gerarCronogramaPrice } from './price';

const d = (v: string | number) => new Decimal(v);

function basePrice(eventos: EntradaProjecao['eventos'], extra?: Partial<EntradaProjecao>) {
  return projetarComEventos({
    principal: d(1000),
    taxaPeriodo: d('0.01'),
    prazo: 12,
    sistema: 'price',
    eventos,
    ...extra,
  });
}

describe('eventos (pos-simulacao)', () => {
  it('sem eventos: reproduz o cronograma base (determinismo)', () => {
    const r = basePrice([]);
    const base = gerarCronogramaPrice({ principal: d(1000), taxaPeriodo: d('0.01'), prazo: 12 });
    expect(r.parcelas).toHaveLength(12);
    expect(r.parcelas.map((p) => p.valorParcela)).toEqual(base.map((p) => p.valorParcela));
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(r.resumo.economiaJuros).toBe('0.00');
  });

  it('amortizacao extra reduzir-prazo: encurta o cronograma e fecha o principal', () => {
    const r = basePrice([{ tipo: 'amortizacao', apos: 1, valor: '200', opcao: 'reduzir-prazo' }]);
    expect(r.resumo.prazoFinal).toBeLessThan(12);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(Number(r.resumo.economiaJuros)).toBeGreaterThan(0);
    expect(r.parcelas[0].observacao).toContain('Amortizacao extra');
  });

  it('amortizacao extra reduzir-parcela: mantem o prazo e reduz a parcela', () => {
    const r = basePrice([{ tipo: 'amortizacao', apos: 1, valor: '200', opcao: 'reduzir-parcela' }]);
    expect(r.resumo.prazoFinal).toBe(12);
    expect(Number(r.parcelas[1].valorParcela)).toBeLessThan(88.85);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
  });

  it('quitacao antecipada: encerra na parcela e amortiza o principal todo', () => {
    const r = basePrice([{ tipo: 'quitacao', apos: 6 }]);
    expect(r.resumo.prazoFinal).toBe(6);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(r.parcelas[5].observacao).toContain('Quitacao');
  });

  it('antecipacao de parcelas (Price): reduz o prazo via valor presente', () => {
    const r = basePrice([{ tipo: 'antecipacao', apos: 3, quantidade: 2 }]);
    expect(r.resumo.prazoFinal).toBeLessThan(12);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(r.parcelas[2].observacao).toContain('Antecipacao');
  });

  it('pagamento com atraso: aplica mora na parcela', () => {
    const r = basePrice([{ tipo: 'pagamento', apos: 1, diasAtraso: 30 }], {
      mora: { jurosMensal: d('0.01'), multa: d('0.02') },
    });
    // mora = 88.85*0.02 + 88.85*0.01*(30/30) = 1.777 + 0.8885 = 2.6655 -> 2.67
    expect(r.parcelas[0].encargos).toBe('2.67');
    expect(r.parcelas[0].valorParcela).toBe('91.52');
    expect(r.resumo.totalEncargos).toBe('2.67');
  });

  it('antecipacao de parcelas no SAC: reduz o prazo via valor presente', () => {
    const r = projetarComEventos({
      principal: d(1000),
      taxaPeriodo: d('0.01'),
      prazo: 12,
      sistema: 'sac',
      eventos: [{ tipo: 'antecipacao', apos: 3, quantidade: 2 }],
    });
    expect(r.resumo.prazoFinal).toBeLessThan(12);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(r.parcelas[2].observacao).toContain('Antecipacao');
  });

  it('CET com eventos: sem tarifas, o CET ~ taxa do contrato (1%)', () => {
    const r = basePrice([{ tipo: 'amortizacao', apos: 3, valor: '300', opcao: 'reduzir-prazo' }]);
    expect(Number(r.resumo.cetMensal)).toBeGreaterThan(0.0099);
    expect(Number(r.resumo.cetMensal)).toBeLessThan(0.0102);
  });

  it('quitacao pro-rata: paga saldo corrigido por fracao de periodo', () => {
    // quitacao apos parcela 6 com meio periodo decorrido: payoff = saldo*(1+i)^0.5
    const r = basePrice([{ tipo: 'quitacao', apos: 6, fracaoPeriodo: '0.5' }]);
    expect(r.resumo.prazoFinal).toBe(6);
    // saldo apos parc.6 = 514.92 ; payoff = 514.92*(1.01)^0.5 ~ 517.49
    expect(r.parcelas[5].observacao).toContain('pro-rata');
    // principal vai p/ amortizacao; o excedente pro-rata vira juros
    expect(r.resumo.amortizacoesExtras).toBe('514.92');
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(Number(r.resumo.totalPago)).toBeGreaterThan(1000);
  });

  it('pagamento parcial: re-amortiza mantendo o prazo', () => {
    // parcela agendada 88.85; paga 70 na parcela 1 (juros 10 -> amort 60)
    const r = basePrice([{ tipo: 'pagamento', apos: 1, diasAtraso: 0, valorPago: '70' }]);
    expect(r.parcelas[0].amortizacao).toBe('60.00');
    expect(r.parcelas[0].valorParcela).toBe('70.00');
    expect(r.resumo.prazoFinal).toBe(12); // prazo mantido
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
  });

  it('pagamento inferior aos juros lanca erro (amortizacao negativa)', () => {
    expect(() =>
      basePrice([{ tipo: 'pagamento', apos: 1, diasAtraso: 0, valorPago: '5' }]),
    ).toThrow();
  });
});
