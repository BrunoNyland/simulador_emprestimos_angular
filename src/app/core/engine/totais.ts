import { Decimal } from './decimal.config';
import { Parcela } from './models';

export interface TotaisCronograma {
  totalJuros: string;
  totalAmortizacao: string;
  totalEncargos: string;
  totalParcelas: string;
}

/** Soma os totais de um cronograma (valores ja arredondados em 2 casas). */
export function somarTotais(parcelas: Parcela[]): TotaisCronograma {
  let juros = new Decimal(0);
  let amortizacao = new Decimal(0);
  let encargos = new Decimal(0);
  let parcelasTotal = new Decimal(0);

  for (const p of parcelas) {
    juros = juros.plus(p.juros);
    amortizacao = amortizacao.plus(p.amortizacao);
    encargos = encargos.plus(p.encargos);
    parcelasTotal = parcelasTotal.plus(p.valorParcela);
  }

  return {
    totalJuros: juros.toFixed(2),
    totalAmortizacao: amortizacao.toFixed(2),
    totalEncargos: encargos.toFixed(2),
    totalParcelas: parcelasTotal.toFixed(2),
  };
}
