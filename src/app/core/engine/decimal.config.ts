import Decimal from 'decimal.js';

/**
 * Configuracao global de precisao decimal do motor de calculo.
 *
 * REGRA DO PROJETO (ver CALCULATION_REFERENCE.md secao 0):
 * e proibido usar `number` nativo para valores monetarios ou taxas.
 * Toda aritmetica financeira passa por Decimal.
 */

/** Precisao interna (digitos significativos) usada nos calculos intermediarios. */
export const PRECISAO_INTERNA = 34;

/** Casas decimais para exibicao/contabil (moeda). */
export const CASAS_MONETARIAS = 2;

/** Modo de arredondamento padrao: half-even (bancario). */
export const MODO_ARREDONDAMENTO: Decimal.Rounding = Decimal.ROUND_HALF_EVEN;

// Aplica a configuracao global a Decimal (afeta toda a aplicacao).
Decimal.set({
  precision: PRECISAO_INTERNA,
  rounding: MODO_ARREDONDAMENTO,
});

export { Decimal };

/** Arredonda um valor para casas monetarias (2) usando o modo configurado. */
export function arredondarMoeda(valor: Decimal.Value): Decimal {
  return new Decimal(valor).toDecimalPlaces(CASAS_MONETARIAS, MODO_ARREDONDAMENTO);
}
