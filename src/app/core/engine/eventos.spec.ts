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
    dataBase: '2026-01-01',
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
      dataBase: '2026-01-01',
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

  it('CET sempre usa a convencao BACEN (dias/365); dataBase vazia e rejeitada', () => {
    const ev = [
      { tipo: 'amortizacao' as const, apos: 3, valor: '100', opcao: 'reduzir-prazo' as const },
    ];
    const r = projetarComEventos({
      principal: d(1000),
      taxaPeriodo: d('0.01'),
      prazo: 12,
      sistema: 'price',
      eventos: ev,
      dataBase: '2026-01-01',
    });
    expect(Number(r.resumo.cetMensal)).toBeGreaterThan(0.0099);
    expect(Number(r.resumo.cetMensal)).toBeLessThan(0.0102);
    expect(r.parcelas[0].dataVencimento).toBe('2026-02-01');

    expect(() =>
      projetarComEventos({
        principal: d(1000),
        taxaPeriodo: d('0.01'),
        prazo: 12,
        sistema: 'price',
        eventos: ev,
        dataBase: '',
      }),
    ).toThrow();
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

  it('amortizacao por data (pro-rata): divide os juros da proxima parcela', () => {
    // amort 200 reduzir-parcela apos parc.1 com meio periodo decorrido (frac 0.5)
    // saldo apos parc.1 = 921.15; juros parc.2 pro-rata =
    //   921.15*0.01*0.5 + 721.15*0.01*0.5 = 8.21 (vs 7.21 sem pro-rata)
    const r = basePrice([
      { tipo: 'amortizacao', apos: 1, valor: '200', opcao: 'reduzir-parcela', fracaoPeriodo: '0.5' },
    ]);
    expect(r.parcelas[1].juros).toBe('8.21');
    expect(r.parcelas[0].observacao).toContain('pro-rata');
  });

  it('pagamento inferior aos juros lanca erro (amortizacao negativa)', () => {
    expect(() =>
      basePrice([{ tipo: 'pagamento', apos: 1, diasAtraso: 0, valorPago: '5' }]),
    ).toThrow();
  });

  it('amortizacao extra maior que o saldo: capa no saldo e quita a operacao', () => {
    const r = basePrice([{ tipo: 'amortizacao', apos: 1, valor: '5000', opcao: 'reduzir-prazo' }]);
    expect(r.resumo.prazoFinal).toBe(1);
    // saldo apos parc.1 = 921.15 -> amortiza so o saldo, nao os 5000
    expect(r.resumo.amortizacoesExtras).toBe('921.15');
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
  });

  it('pagamento acima do saldo: amortizacao capada no saldo inicial (quita na parcela)', () => {
    const r = basePrice([{ tipo: 'pagamento', apos: 1, diasAtraso: 0, valorPago: '2000' }]);
    expect(r.parcelas[0].amortizacao).toBe('1000.00');
    expect(r.parcelas[0].valorParcela).toBe('1010.00');
    expect(r.resumo.prazoFinal).toBe(1);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
  });

  it('atraso sem parametros de mora: nenhum encargo e aplicado', () => {
    const r = basePrice([{ tipo: 'pagamento', apos: 1, diasAtraso: 30 }]);
    expect(r.parcelas[0].encargos).toBe('0.00');
    expect(r.resumo.totalEncargos).toBe('0.00');
  });

  it('amortizacao reduzir-parcela no SAC: mantem o prazo e reduz a amortizacao constante', () => {
    const r = projetarComEventos({
      principal: d(1000),
      taxaPeriodo: d('0.01'),
      prazo: 12,
      sistema: 'sac',
      eventos: [{ tipo: 'amortizacao', apos: 1, valor: '200', opcao: 'reduzir-parcela' }],
      dataBase: '2026-01-01',
    });
    expect(r.resumo.prazoFinal).toBe(12);
    // saldo apos parc.1 = 916.67 - 200 = 716.67 em 11 parcelas -> amort 65.15
    expect(r.parcelas[1].amortizacao).toBe('65.15');
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
  });

  it('valorLiberado menor que o principal eleva o CET acima da taxa do contrato', () => {
    // ex.: IOF/tarifas de 50 deduzidos na liberacao
    const r = basePrice([], { valorLiberado: d(950) });
    expect(Number(r.resumo.cetMensal)).toBeGreaterThan(0.01);
  });

  it('eventos antes da 1a parcela (apos=0) sao aplicados sobre o principal', () => {
    const r = basePrice([{ tipo: 'amortizacao', apos: 0, valor: '200', opcao: 'reduzir-parcela' }]);
    // saldo cai p/ 800 antes da 1a parcela -> juros da parc.1 = 8.00
    expect(r.parcelas[0].juros).toBe('8.00');
    expect(r.resumo.prazoFinal).toBe(12);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
  });
});

describe('eventos: tracos de calculo (transparencia por linha)', () => {
  const passo = (tr: { passos: { id: string; resultado?: string }[] }, id: string) =>
    tr.passos.find((p) => p.id === id)?.resultado;

  it('mora: o traco reproduz multa + juros de mora = encargos da linha', () => {
    const r = basePrice([{ tipo: 'pagamento', apos: 1, diasAtraso: 30 }], {
      mora: { jurosMensal: d('0.01'), multa: d('0.02') },
    });
    const tr = r.parcelas[0].tracosEvento?.find((t) => t.id === 'evento-mora');
    expect(tr).toBeTruthy();
    // multa = 88.85*0.02 = 1.777; juros = 88.85*0.01 = 0.8885; total -> 2.67 (= encargos)
    expect(new Decimal(passo(tr!, 'total')!).toDecimalPlaces(2).toFixed(2)).toBe(
      r.parcelas[0].encargos,
    );
  });

  it('amortizacao extra: o traco mostra o valor aplicado e o novo saldo', () => {
    const r = basePrice([{ tipo: 'amortizacao', apos: 1, valor: '200', opcao: 'reduzir-prazo' }]);
    const tr = r.parcelas[0].tracosEvento?.find((t) => t.id === 'evento-amortizacao');
    expect(tr).toBeTruthy();
    expect(new Decimal(passo(tr!, 'valor')!).toFixed(2)).toBe('200.00');
    // novo saldo = saldo apos a 1a parcela (saldoFinal da linha) - 200
    const esperado = new Decimal(r.parcelas[0].saldoFinal).minus(200).toFixed(2);
    expect(new Decimal(passo(tr!, 'saldo')!).toFixed(2)).toBe(esperado);
  });

  it('quitacao: o traco expoe o payoff igual ao saldo devedor da linha', () => {
    const r = basePrice([{ tipo: 'quitacao', apos: 6 }]);
    const tr = r.parcelas[5].tracosEvento?.find((t) => t.id === 'evento-quitacao');
    expect(tr).toBeTruthy();
    // sem fracao: payoff = saldo devedor antes da quitacao (= saldoFinal da parcela 6)
    expect(new Decimal(passo(tr!, 'payoff')!).toFixed(2)).toBe(r.parcelas[5].saldoFinal);
  });
});

describe('eventos: detalhes alinhados (linha propria na tabela)', () => {
  it('amortizacao extra: detalhe traz data, amortizacao e saldo apos', () => {
    const r = basePrice([{ tipo: 'amortizacao', apos: 1, valor: '200', opcao: 'reduzir-prazo' }]);
    const det = r.parcelas[0].detalhes?.[0];
    expect(det).toBeTruthy();
    expect(det!.tipo).toBe('amortizacao');
    expect(det!.data).toBe(r.parcelas[0].dataVencimento);
    expect(det!.juros).toBe('0.00');
    expect(det!.amortizacao).toBe('200.00');
    expect(det!.valor).toBe('200.00');
    expect(det!.saldoApos).toBe(new Decimal(r.parcelas[0].saldoFinal).minus(200).toFixed(2));
  });

  it('quitacao: detalhe separa amortizacao (saldo) de juros e zera o saldo apos', () => {
    const r = basePrice([{ tipo: 'quitacao', apos: 6 }]);
    const det = r.parcelas[5].detalhes?.[0];
    expect(det).toBeTruthy();
    expect(det!.tipo).toBe('quitacao');
    expect(det!.amortizacao).toBe(r.parcelas[5].saldoFinal);
    expect(det!.saldoApos).toBe('0.00');
  });

  it('mora: detalhe registra o encargo como juros do evento', () => {
    const r = basePrice([{ tipo: 'pagamento', apos: 1, diasAtraso: 30 }], {
      mora: { jurosMensal: d('0.01'), multa: d('0.02') },
    });
    const det = r.parcelas[0].detalhes?.find((x) => x.descricao.includes('Atraso'));
    expect(det).toBeTruthy();
    expect(det!.juros).toBe('2.67');
    expect(det!.amortizacao).toBe('0.00');
  });

  it('omitirCet: pula o CET (caro) mas mantem o cronograma e os detalhes', () => {
    const r = basePrice([{ tipo: 'amortizacao', apos: 3, valor: '300', opcao: 'reduzir-prazo' }], {
      omitirCet: true,
    });
    expect(r.resumo.cetMensal).toBe('');
    expect(r.resumo.cetAnual).toBe('');
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(r.parcelas[2].detalhes?.[0]?.amortizacao).toBe('300.00');
  });
});
