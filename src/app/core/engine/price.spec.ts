import { Decimal } from './decimal.config';
import { gerarCronogramaPrice, valorParcelaPrice } from './price';
import { somarTotais } from './totais';

const d = (v: string | number) => new Decimal(v);

describe('price', () => {
  it('calcula o PMT (PV=1000, i=1%, n=12)', () => {
    expect(valorParcelaPrice(d(1000), d('0.01'), 12).toDecimalPlaces(2).toString()).toBe('88.85');
  });

  it('gera cronograma com parcela constante e fecha os totais', () => {
    const parcelas = gerarCronogramaPrice({ principal: d(1000), taxaPeriodo: d('0.01'), prazo: 12 });
    expect(parcelas).toHaveLength(12);
    expect(parcelas[0].valorParcela).toBe('88.85');
    expect(parcelas[0].juros).toBe('10.00');
    expect(parcelas[11].saldoFinal).toBe('0.00');

    const totais = somarTotais(parcelas);
    // Sum amortizacao == principal (residuo absorvido na ultima parcela)
    expect(totais.totalAmortizacao).toBe('1000.00');
  });

  it('trata taxa zero (PMT = PV/n)', () => {
    const parcelas = gerarCronogramaPrice({ principal: d(1200), taxaPeriodo: d(0), prazo: 12 });
    expect(parcelas[0].valorParcela).toBe('100.00');
    expect(parcelas[0].juros).toBe('0.00');
    expect(somarTotais(parcelas).totalAmortizacao).toBe('1200.00');
  });

  it('gera vencimentos mensais quando dataBase e informada', () => {
    const parcelas = gerarCronogramaPrice({
      principal: d(1000),
      taxaPeriodo: d('0.01'),
      prazo: 3,
      dataBase: '2026-01-10',
    });
    expect(parcelas.map((p) => p.dataVencimento)).toEqual([
      '2026-02-10',
      '2026-03-10',
      '2026-04-10',
    ]);
  });
});
