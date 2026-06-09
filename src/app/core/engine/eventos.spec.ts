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

  it('antecipacao em SAC lanca erro nesta fase', () => {
    expect(() =>
      projetarComEventos({
        principal: d(1000),
        taxaPeriodo: d('0.01'),
        prazo: 12,
        sistema: 'sac',
        eventos: [{ tipo: 'antecipacao', apos: 3, quantidade: 2 }],
      }),
    ).toThrow();
  });
});
