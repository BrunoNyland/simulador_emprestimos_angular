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
  });
});
