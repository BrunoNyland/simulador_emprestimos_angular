import { Decimal } from './decimal.config';
import { EntradaProjecao, projetarComEventos } from './eventos';
import { gerarCronogramaPrice } from './price';
import { adicionarMeses } from './dates';

const d = (v: string | number) => new Decimal(v);

const DATA_BASE = '2026-01-01';
/** Vencimento da parcela k (eventos na data de uma parcela => fração 0). */
const venc = (k: number) => adicionarMeses(DATA_BASE, k);
/** Soma `dias` corridos a uma data ISO (para forçar pro-rata/atraso). */
const maisDias = (iso: string, dias: number): string => {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + dias)).toISOString().slice(0, 10);
};

function basePrice(eventos: EntradaProjecao['eventos'], extra?: Partial<EntradaProjecao>) {
  return projetarComEventos({
    principal: d(1000),
    taxaPeriodo: d('0.01'),
    prazo: 12,
    sistema: 'price',
    eventos,
    dataBase: DATA_BASE,
    ...extra,
  });
}

describe('eventos (pos-simulacao, dirigidos por data)', () => {
  it('sem eventos: reproduz o cronograma base (determinismo)', () => {
    const r = basePrice([]);
    const base = gerarCronogramaPrice({ principal: d(1000), taxaPeriodo: d('0.01'), prazo: 12 });
    expect(r.parcelas).toHaveLength(12);
    expect(r.parcelas.map((p) => p.valorParcela)).toEqual(base.map((p) => p.valorParcela));
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(r.resumo.economiaJuros).toBe('0.00');
  });

  it('amortizacao extra reduzir-prazo: encurta o cronograma e fecha o principal', () => {
    const r = basePrice([
      { tipo: 'amortizacao', data: venc(1), valor: '200', base: 'amortizado', opcao: 'reduzir-prazo' },
    ]);
    expect(r.resumo.prazoFinal).toBeLessThan(12);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(Number(r.resumo.economiaJuros)).toBeGreaterThan(0);
    expect(r.parcelas[0].observacao).toContain('Amortizacao extra');
  });

  it('amortizacao extra reduzir-parcela: mantem o prazo e reduz a parcela', () => {
    const r = basePrice([
      { tipo: 'amortizacao', data: venc(1), valor: '200', base: 'amortizado', opcao: 'reduzir-parcela' },
    ]);
    expect(r.resumo.prazoFinal).toBe(12);
    expect(Number(r.parcelas[1].valorParcela)).toBeLessThan(88.85);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
  });

  it('quitacao antecipada: encerra na parcela e amortiza o principal todo', () => {
    const r = basePrice([{ tipo: 'quitacao', data: venc(6) }]);
    expect(r.resumo.prazoFinal).toBe(6);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(r.parcelas[5].observacao).toContain('Quitacao');
  });

  it('antecipacao de parcelas (Price): reduz o prazo via valor presente', () => {
    const r = basePrice([{ tipo: 'antecipacao', data: venc(3), quantidade: 2 }]);
    expect(r.resumo.prazoFinal).toBeLessThan(12);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(r.parcelas[2].observacao).toContain('Antecipacao');
  });

  it('pagamento com atraso: aplica mora na parcela', () => {
    const r = basePrice(
      [{ tipo: 'pagamento', dataVencimento: venc(1), dataPagamento: maisDias(venc(1), 30) }],
      { mora: { jurosMensal: d('0.01'), multa: d('0.02') } },
    );
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
      eventos: [{ tipo: 'antecipacao', data: venc(3), quantidade: 2 }],
      dataBase: DATA_BASE,
    });
    expect(r.resumo.prazoFinal).toBeLessThan(12);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(r.parcelas[2].observacao).toContain('Antecipacao');
  });

  it('CET com eventos: sem tarifas, o CET ~ taxa do contrato (1%)', () => {
    const r = basePrice([
      { tipo: 'amortizacao', data: venc(3), valor: '300', base: 'amortizado', opcao: 'reduzir-prazo' },
    ]);
    expect(Number(r.resumo.cetMensal)).toBeGreaterThan(0.0099);
    expect(Number(r.resumo.cetMensal)).toBeLessThan(0.0102);
  });

  it('CET sempre usa a convencao BACEN (dias/365); dataBase vazia e rejeitada', () => {
    const ev = [
      {
        tipo: 'amortizacao' as const,
        data: venc(3),
        valor: '100',
        base: 'amortizado' as const,
        opcao: 'reduzir-prazo' as const,
      },
    ];
    const r = projetarComEventos({
      principal: d(1000),
      taxaPeriodo: d('0.01'),
      prazo: 12,
      sistema: 'price',
      eventos: ev,
      dataBase: DATA_BASE,
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
    // quitacao no meio do periodo apos a parcela 6 (15 dias => fracao ~0.5)
    const r = basePrice([{ tipo: 'quitacao', data: maisDias(venc(6), 15) }]);
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
    const r = basePrice([
      { tipo: 'pagamento', dataVencimento: venc(1), dataPagamento: venc(1), valorPago: '70' },
    ]);
    expect(r.parcelas[0].amortizacao).toBe('60.00');
    expect(r.parcelas[0].valorParcela).toBe('70.00');
    expect(r.resumo.prazoFinal).toBe(12); // prazo mantido
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
  });

  it('amortizacao no meio do periodo: liquida juros pro-rata no evento; proxima parcela so o restante', () => {
    // amort 200 reduzir-parcela 15 dias apos a parcela 1 (fracao ~0.5).
    // saldo apos parc.1 = 921.15.
    //   juros pro-rata do evento = 921.15*0.01*0.5 = 4.61 (pago no dia)
    //   parcela 2 cobra so o restante: 721.15*0.01*0.5 = 3.61
    const r = basePrice([
      {
        tipo: 'amortizacao',
        data: maisDias(venc(1), 15),
        valor: '200',
        base: 'amortizado',
        opcao: 'reduzir-parcela',
      },
    ]);
    expect(r.parcelas[1].juros).toBe('3.61');
    expect(r.parcelas[0].detalhes?.[0]?.juros).toBe('4.61');
    expect(r.parcelas[0].observacao).toContain('pro-rata');
  });

  it('amortizacao base "pago": separa o total pago em juros pro-rata + amortizacao', () => {
    // total pago 200, 15 dias apos parc.1 (frac 0.5): juros 4.61, amort 195.39
    const r = basePrice([
      {
        tipo: 'amortizacao',
        data: maisDias(venc(1), 15),
        valor: '200',
        base: 'pago',
        opcao: 'reduzir-prazo',
      },
    ]);
    const det = r.parcelas[0].detalhes?.[0];
    expect(det!.juros).toBe('4.61');
    expect(det!.amortizacao).toBe('195.39');
    expect(det!.valor).toBe('200.00');
  });

  it('amortizacao base "pago" que nao cobre os juros pro-rata lanca erro', () => {
    // 15 dias apos parc.1: juros pro-rata ~4.61; pagar 3 nao cobre
    expect(() =>
      basePrice([
        {
          tipo: 'amortizacao',
          data: maisDias(venc(1), 15),
          valor: '3',
          base: 'pago',
          opcao: 'reduzir-prazo',
        },
      ]),
    ).toThrow();
  });

  it('pagamento inferior aos juros lanca erro (amortizacao negativa)', () => {
    expect(() =>
      basePrice([
        { tipo: 'pagamento', dataVencimento: venc(1), dataPagamento: venc(1), valorPago: '5' },
      ]),
    ).toThrow();
  });

  it('amortizacao extra maior que o saldo: capa no saldo e quita a operacao', () => {
    const r = basePrice([
      { tipo: 'amortizacao', data: venc(1), valor: '5000', base: 'amortizado', opcao: 'reduzir-prazo' },
    ]);
    expect(r.resumo.prazoFinal).toBe(1);
    // saldo apos parc.1 = 921.15 -> amortiza so o saldo, nao os 5000
    expect(r.resumo.amortizacoesExtras).toBe('921.15');
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
  });

  it('pagamento acima do saldo: amortizacao capada no saldo inicial (quita na parcela)', () => {
    const r = basePrice([
      { tipo: 'pagamento', dataVencimento: venc(1), dataPagamento: venc(1), valorPago: '2000' },
    ]);
    expect(r.parcelas[0].amortizacao).toBe('1000.00');
    expect(r.parcelas[0].valorParcela).toBe('1010.00');
    expect(r.resumo.prazoFinal).toBe(1);
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
  });

  it('atraso sem parametros de mora: nenhum encargo e aplicado', () => {
    const r = basePrice([
      { tipo: 'pagamento', dataVencimento: venc(1), dataPagamento: maisDias(venc(1), 30) },
    ]);
    expect(r.parcelas[0].encargos).toBe('0.00');
    expect(r.resumo.totalEncargos).toBe('0.00');
  });

  it('amortizacao reduzir-parcela no SAC: mantem o prazo e reduz a amortizacao constante', () => {
    const r = projetarComEventos({
      principal: d(1000),
      taxaPeriodo: d('0.01'),
      prazo: 12,
      sistema: 'sac',
      eventos: [
        { tipo: 'amortizacao', data: venc(1), valor: '200', base: 'amortizado', opcao: 'reduzir-parcela' },
      ],
      dataBase: DATA_BASE,
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

  it('eventos antes da 1a parcela (data de liberacao) sao aplicados sobre o principal', () => {
    const r = basePrice([
      { tipo: 'amortizacao', data: DATA_BASE, valor: '200', base: 'amortizado', opcao: 'reduzir-parcela' },
    ]);
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
    const r = basePrice(
      [{ tipo: 'pagamento', dataVencimento: venc(1), dataPagamento: maisDias(venc(1), 30) }],
      { mora: { jurosMensal: d('0.01'), multa: d('0.02') } },
    );
    const tr = r.parcelas[0].tracosEvento?.find((t) => t.id === 'evento-mora');
    expect(tr).toBeTruthy();
    // multa = 88.85*0.02 = 1.777; juros = 88.85*0.01 = 0.8885; total -> 2.67 (= encargos)
    expect(new Decimal(passo(tr!, 'total')!).toDecimalPlaces(2).toFixed(2)).toBe(
      r.parcelas[0].encargos,
    );
  });

  it('amortizacao extra: o traco mostra a amortizacao e o novo saldo', () => {
    const r = basePrice([
      { tipo: 'amortizacao', data: venc(1), valor: '200', base: 'amortizado', opcao: 'reduzir-prazo' },
    ]);
    const tr = r.parcelas[0].tracosEvento?.find((t) => t.id === 'evento-amortizacao');
    expect(tr).toBeTruthy();
    expect(new Decimal(passo(tr!, 'amort')!).toFixed(2)).toBe('200.00');
    // novo saldo = saldo apos a 1a parcela (saldoFinal da linha) - 200
    const esperado = new Decimal(r.parcelas[0].saldoFinal).minus(200).toFixed(2);
    expect(new Decimal(passo(tr!, 'saldo')!).toFixed(2)).toBe(esperado);
  });

  it('quitacao: o traco expoe o payoff igual ao saldo devedor da linha', () => {
    const r = basePrice([{ tipo: 'quitacao', data: venc(6) }]);
    const tr = r.parcelas[5].tracosEvento?.find((t) => t.id === 'evento-quitacao');
    expect(tr).toBeTruthy();
    // sem fracao: payoff = saldo devedor antes da quitacao (= saldoFinal da parcela 6)
    expect(new Decimal(passo(tr!, 'payoff')!).toFixed(2)).toBe(r.parcelas[5].saldoFinal);
  });
});

describe('eventos: detalhes alinhados (linha propria na tabela)', () => {
  it('amortizacao extra: detalhe traz data, amortizacao e saldo apos', () => {
    const r = basePrice([
      { tipo: 'amortizacao', data: venc(1), valor: '200', base: 'amortizado', opcao: 'reduzir-prazo' },
    ]);
    const det = r.parcelas[0].detalhes?.[0];
    expect(det).toBeTruthy();
    expect(det!.tipo).toBe('amortizacao');
    expect(det!.data).toBe(venc(1));
    expect(det!.juros).toBe('0.00');
    expect(det!.amortizacao).toBe('200.00');
    expect(det!.valor).toBe('200.00');
    expect(det!.saldoApos).toBe(new Decimal(r.parcelas[0].saldoFinal).minus(200).toFixed(2));
  });

  it('quitacao: detalhe separa amortizacao (saldo) de juros e zera o saldo apos', () => {
    const r = basePrice([{ tipo: 'quitacao', data: venc(6) }]);
    const det = r.parcelas[5].detalhes?.[0];
    expect(det).toBeTruthy();
    expect(det!.tipo).toBe('quitacao');
    expect(det!.amortizacao).toBe(r.parcelas[5].saldoFinal);
    expect(det!.saldoApos).toBe('0.00');
  });

  it('mora: detalhe registra o encargo como juros do evento na data do pagamento', () => {
    const dataPag = maisDias(venc(1), 30);
    const r = basePrice(
      [{ tipo: 'pagamento', dataVencimento: venc(1), dataPagamento: dataPag }],
      { mora: { jurosMensal: d('0.01'), multa: d('0.02') } },
    );
    const det = r.parcelas[0].detalhes?.find((x) => x.descricao.includes('Atraso'));
    expect(det).toBeTruthy();
    expect(det!.juros).toBe('2.67');
    expect(det!.amortizacao).toBe('0.00');
    expect(det!.data).toBe(dataPag);
  });

  it('omitirCet: pula o CET (caro) mas mantem o cronograma e os detalhes', () => {
    const r = basePrice(
      [{ tipo: 'amortizacao', data: venc(3), valor: '300', base: 'amortizado', opcao: 'reduzir-prazo' }],
      { omitirCet: true },
    );
    expect(r.resumo.cetMensal).toBe('');
    expect(r.resumo.cetAnual).toBe('');
    expect(r.resumo.totalAmortizacao).toBe('1000.00');
    expect(r.parcelas[2].detalhes?.[0]?.amortizacao).toBe('300.00');
  });
});
