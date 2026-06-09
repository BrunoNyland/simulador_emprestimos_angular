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

  it('eventos: amortizacao extra reduz o prazo e expoe resumoEventos', () => {
    store.sistema.set('price');
    store.campoAlvo.set('parcela');
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);
    store.adicionarEvento({ tipo: 'amortizacao', apos: 1, valor: '200', opcao: 'reduzir-prazo' });

    const r = store.resultado();
    expect(r.tipo).toBe('ok');
    if (r.tipo === 'ok') {
      expect(r.dados.resumoEventos).toBeDefined();
      expect(r.dados.resumoEventos!.prazoFinal).toBeLessThan(12);
      expect(r.dados.totais.totalAmortizacao).toBe('1000.00');
      expect(r.dados.cetMensal).toBe('');
    }
  });

  it('eventos: cancelar (remover) reprojeta de volta ao cronograma base', () => {
    store.sistema.set('price');
    store.valorBruto.set('1000');
    store.taxa.set('0.01');
    store.prazo.set(12);
    store.adicionarEvento({ tipo: 'quitacao', apos: 6 });
    expect((store.resultado() as { dados: { parcelas: unknown[] } }).dados.parcelas).toHaveLength(6);

    store.removerEvento(0);
    const r = store.resultado();
    if (r.tipo === 'ok') {
      expect(r.dados.parcelas).toHaveLength(12);
      expect(r.dados.resumoEventos).toBeUndefined();
    }
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
