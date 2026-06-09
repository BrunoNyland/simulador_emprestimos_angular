import { Decimal } from './decimal.config';
import { Encargo } from './models';

/** Valor de um encargo em funcao do principal e do prazo. */
export function calcularEncargo(encargo: Encargo, principal: Decimal, prazo: number): Decimal {
  const v = new Decimal(encargo.valor);
  switch (encargo.tipo) {
    case 'fixo':
    case 'unico':
      return v;
    case 'percentual-principal':
      return principal.times(v);
    case 'percentual-ap':
      return principal.times(v).times(prazo);
    case 'por-periodo':
      return v.times(prazo);
    default:
      return new Decimal(0);
  }
}

/** Soma dos encargos marcados como deduzidos do liquido. */
export function totalEncargosDeduzidos(
  encargos: Encargo[],
  principal: Decimal,
  prazo: number,
): Decimal {
  return encargos
    .filter((e) => e.deduzidoDoLiquido)
    .reduce((acc, e) => acc.plus(calcularEncargo(e, principal, prazo)), new Decimal(0));
}

/** Liquido = bruto - encargos deduzidos (calculados sobre o bruto). */
export function brutoParaLiquido(bruto: Decimal, encargos: Encargo[], prazo: number): Decimal {
  return bruto.minus(totalEncargosDeduzidos(encargos, bruto, prazo));
}

/**
 * Resolve o bruto a partir do liquido (CALC_REF secao 7).
 * Trata encargos proporcionais ao bruto (% do principal / % a.p.) que tornam a
 * relacao circular: liquido = bruto*(1 - pSum) - fixo  =>  bruto = (liquido + fixo)/(1 - pSum).
 */
export function liquidoParaBruto(liquido: Decimal, encargos: Encargo[], prazo: number): Decimal {
  let pSum = new Decimal(0); // fracao proporcional ao bruto
  let fixo = new Decimal(0); // valores independentes do bruto

  for (const e of encargos) {
    if (!e.deduzidoDoLiquido) {
      continue;
    }
    const v = new Decimal(e.valor);
    switch (e.tipo) {
      case 'percentual-principal':
        pSum = pSum.plus(v);
        break;
      case 'percentual-ap':
        pSum = pSum.plus(v.times(prazo));
        break;
      case 'fixo':
      case 'unico':
        fixo = fixo.plus(v);
        break;
      case 'por-periodo':
        fixo = fixo.plus(v.times(prazo));
        break;
    }
  }

  const denom = new Decimal(1).minus(pSum);
  if (denom.lessThanOrEqualTo(0)) {
    throw new Error('Encargos percentuais inviabilizam a operacao (>= 100% do bruto).');
  }
  return liquido.plus(fixo).div(denom);
}
