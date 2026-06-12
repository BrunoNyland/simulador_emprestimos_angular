import { Decimal } from './decimal.config';
import { gerarCronogramaSac } from './sac';
import { somarTotais } from './totais';

const d = (v: string | number) => new Decimal(v);

describe('sac', () => {
  it('gera cronograma com amortizacao constante e parcela decrescente', () => {
    const parcelas = gerarCronogramaSac({ principal: d(1000), taxaPeriodo: d('0.01'), prazo: 12 });
    expect(parcelas).toHaveLength(12);
    expect(parcelas[0].amortizacao).toBe('83.33');
    expect(parcelas[0].juros).toBe('10.00');
    expect(parcelas[0].valorParcela).toBe('93.33');
    // parcela decresce
    expect(Number(parcelas[1].valorParcela)).toBeLessThan(Number(parcelas[0].valorParcela));
    expect(parcelas[11].saldoFinal).toBe('0.00');
  });

  it('fecha o total amortizado no principal (residuo na ultima parcela)', () => {
    const parcelas = gerarCronogramaSac({ principal: d(1000), taxaPeriodo: d('0.01'), prazo: 12 });
    expect(somarTotais(parcelas).totalAmortizacao).toBe('1000.00');
    // 83.33 * 12 = 999.96 -> a ultima parcela amortiza 83.37 para fechar
    expect(parcelas[11].amortizacao).toBe('83.37');
    expect(parcelas[11].residuo).toBe('0.04');
  });

  it('trata taxa zero (parcela = amortizacao constante)', () => {
    const parcelas = gerarCronogramaSac({ principal: d(1200), taxaPeriodo: d(0), prazo: 12 });
    expect(parcelas[0].valorParcela).toBe('100.00');
    expect(parcelas[0].juros).toBe('0.00');
    expect(parcelas[11].valorParcela).toBe('100.00');
    expect(somarTotais(parcelas).totalAmortizacao).toBe('1200.00');
  });

  it('prazo 1: parcela unica quita principal + juros', () => {
    const parcelas = gerarCronogramaSac({ principal: d(1000), taxaPeriodo: d('0.01'), prazo: 1 });
    expect(parcelas).toHaveLength(1);
    expect(parcelas[0].valorParcela).toBe('1010.00');
    expect(parcelas[0].saldoFinal).toBe('0.00');
    expect(parcelas[0].residuo).toBeUndefined();
  });

  it('rejeita prazo <= 0', () => {
    expect(() =>
      gerarCronogramaSac({ principal: d(1000), taxaPeriodo: d('0.01'), prazo: 0 }),
    ).toThrow();
  });

  it('nao registra residuo quando a amortizacao fecha exata', () => {
    const parcelas = gerarCronogramaSac({ principal: d(1200), taxaPeriodo: d('0.01'), prazo: 12 });
    expect(parcelas[11].residuo).toBeUndefined();
  });

  it('juros decrescem proporcionalmente ao saldo (juros_k = saldo_k * i)', () => {
    const parcelas = gerarCronogramaSac({ principal: d(1200), taxaPeriodo: d('0.01'), prazo: 12 });
    for (const p of parcelas) {
      expect(p.juros).toBe(d(p.saldoInicial).times('0.01').toFixed(2));
      expect(d(p.juros).plus(p.amortizacao).toFixed(2)).toBe(p.valorParcela);
    }
  });
});
