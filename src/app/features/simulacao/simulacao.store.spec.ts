import { TestBed } from '@angular/core/testing';
import { SimulacaoStore } from './simulacao.store';

describe('SimulacaoStore', () => {
  let store: SimulacaoStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(SimulacaoStore);
  });

  it('Price: recalcula parcela ao alterar entradas (campo-alvo=parcela)', () => {
    store.sistema.set('price');
    store.campoAlvo.set('parcela');
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);

    const r = store.resultado();
    expect(r.tipo).toBe('ok');
    if (r.tipo === 'ok') {
      expect(r.dados.parcelaCalculada).toBe('88.85');
      expect(r.dados.totais.totalAmortizacao).toBe('1000.00');
      expect(r.dados.parcelas).toHaveLength(12);
    }
  });

  it('Price: campo-alvo=valorBruto resolve o PV a partir da parcela', () => {
    store.sistema.set('price');
    store.valorBruto.set('0');
    store.campoAlvo.set('valorBruto');
    store.taxa.set('0.01');
    store.prazo.set(12);
    store.parcela.set('88.848788'); // PMT exato p/ PV=1000

    const r = store.resultado();
    expect(r.tipo).toBe('ok');
    if (r.tipo === 'ok') {
      expect(r.dados.parametros.valorBruto).toBe('1000.00');
    }
  });

  it('SAC: gera cronograma decrescente sem solver', () => {
    store.sistema.set('sac');
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);

    const r = store.resultado();
    expect(r.tipo).toBe('ok');
    if (r.tipo === 'ok') {
      expect(r.dados.parcelas[0].amortizacao).toBe('83.33');
      expect(r.dados.totais.totalAmortizacao).toBe('1000.00');
    }
  });

  it('comparativo: Price usa a ultima parcela real (com residuo), nao a constante', () => {
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);

    const comp = store.comparativo();
    expect(comp).not.toBeNull();
    expect(comp!.price.primeiraParcela).toBe('88.85');
    // ultima parcela do Price absorve o residuo -> 88.84 (diferente da 1a)
    expect(comp!.price.ultimaParcela).toBe('88.84');
    expect(comp!.sac.primeiraParcela).toBe('93.33');
    expect(comp!.sac.ultimaParcela).toBe('84.20');
  });

  it('comparativo: inclui IOF total e CET mensal para Price e SAC', () => {
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);

    const comp = store.comparativo();
    expect(comp).not.toBeNull();
    for (const sis of [comp!.price, comp!.sac]) {
      expect(Number(sis.iof)).toBeGreaterThan(0);
      expect(Number(sis.cetMensal)).toBeGreaterThan(0);
    }
    // SAC amortiza mais rapido -> IOF diario menor -> IOF total <= Price
    expect(Number(comp!.sac.iof)).toBeLessThanOrEqual(Number(comp!.price.iof));
  });

  it('comparativo: serie de saldos comeca no principal e termina em zero (n+1 pontos)', () => {
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);

    const comp = store.comparativo();
    expect(comp).not.toBeNull();
    for (const serie of [comp!.price.saldos, comp!.sac.saldos]) {
      expect(serie.length).toBe(13); // 1 (liberacao) + 12 parcelas
      expect(serie[0]).toBe(1000);
      expect(serie[12]).toBeCloseTo(0, 2);
    }
  });

  it('eventos: tabela base permanece intacta e a projecao vai p/ eventosResultado', () => {
    store.sistema.set('price');
    store.campoAlvo.set('parcela');
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);
    store.adicionarEvento({ tipo: 'amortizacao', apos: 1, valor: '200', opcao: 'reduzir-prazo' });

    const base = store.resultado();
    expect(base.tipo).toBe('ok');
    if (base.tipo === 'ok') {
      expect(base.dados.parcelas).toHaveLength(12); // base nao muda
    }

    const ev = store.eventosResultado();
    expect(ev).not.toBeNull();
    expect(ev!.resumo.prazoFinal).toBeLessThan(12);
    expect(ev!.totais.totalAmortizacao).toBe('1000.00');
    expect(Number(ev!.cetMensal)).toBeGreaterThan(0.0099);
  });

  it('eventos: cancelar (remover) zera a projecao; base intacta', () => {
    store.sistema.set('price');
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);
    store.adicionarEvento({ tipo: 'quitacao', apos: 6 });
    expect(store.eventosResultado()!.parcelas).toHaveLength(6);
    const base = store.resultado();
    if (base.tipo === 'ok') {
      expect(base.dados.parcelas).toHaveLength(12);
    }

    store.removerEvento(0);
    expect(store.eventosResultado()).toBeNull();
    const base2 = store.resultado();
    if (base2.tipo === 'ok') {
      expect(base2.dados.parcelas).toHaveLength(12);
    }
  });

  it('IOF: reduz o liquido e eleva o CET (PF, credito pessoal)', () => {
    store.sistema.set('price');
    store.campoAlvo.set('parcela');
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);
    store.publico.set('PF');
    store.produto.set('credito-pessoal');
    store.incluirIof.set(true);
    store.tarifaAbertura.set('0');

    const r = store.resultado();
    if (r.tipo === 'ok') {
      expect(Number(r.dados.iof)).toBeGreaterThan(3.8); // diario + adicional 0,38%
      expect(Number(r.dados.valorLiquido)).toBeLessThan(1000);
      expect(Number(r.dados.cetMensal)).toBeGreaterThan(0.01); // CET > taxa por causa do IOF
    }
  });

  it('sem IOF: CET (BACEN, dias/365) ~ taxa do contrato', () => {
    store.sistema.set('price');
    store.campoAlvo.set('parcela');
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);
    store.incluirIof.set(false);
    store.tarifaAbertura.set('0');

    const r = store.resultado();
    if (r.tipo === 'ok') {
      expect(r.dados.valorLiquido).toBe('1000.00');
      // CET mensal ~ 1% (convencao BACEN dias/365 + arredondamento da parcela)
      const cet = Number(r.dados.cetMensal);
      expect(cet).toBeGreaterThan(0.0099);
      expect(cet).toBeLessThan(0.0102);
    }
  });

  it('IOF: produto habitacional e isento (liquido = bruto)', () => {
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);
    store.incluirIof.set(true);
    store.produto.set('habitacional');

    const r = store.resultado();
    if (r.tipo === 'ok') {
      expect(r.dados.iof).toBe('0.00');
      expect(r.dados.valorLiquido).toBe('1000.00');
    }
  });

  it('reporta erro quando a data de liberacao esta vazia (CET BACEN exige datas)', () => {
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);
    store.dataBase.set('');

    const r = store.resultado();
    expect(r.tipo).toBe('erro');
  });

  it('reporta erro para prazo invalido', () => {
    store.sistema.set('price');
    store.campoAlvo.set('parcela');
    store.valorBruto.set('1000');
    store.prazo.set(0);

    const r = store.resultado();
    expect(r.tipo).toBe('erro');
  });
});
