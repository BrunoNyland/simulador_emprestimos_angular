import { Decimal } from './decimal.config';

/** Um fluxo de caixa datado (em periodos-base a partir da liberacao). */
export interface FluxoCaixa {
  /** Prazo ate o fluxo, em periodos-base (ex.: dias/30 ou indice da parcela). */
  periodo: Decimal;
  /** Valor pago pelo cliente no periodo (parcela + encargos + tributos). */
  valor: Decimal;
}

export interface ResultadoCet {
  mensal: Decimal;
  anual: Decimal;
}

export interface OpcoesCet {
  periodosAno?: number;
  tolerancia?: Decimal.Value;
  maxIteracoes?: number;
}

const LIMITE_INFERIOR = '-0.999999'; // 1+i deve permanecer > 0

/**
 * Calcula o CET como a TIR (IRR) do fluxo de caixa (Resolucao CMN 4.881/2020).
 * Resolve: valorLiberado = Sum( valor_j / (1+i)^periodo_j ).
 * Newton-Raphson com fallback por bissecao.
 * Ver CALCULATION_REFERENCE.md secao 5.
 */
export function calcularCet(
  valorLiberado: Decimal,
  fluxos: FluxoCaixa[],
  opcoes: OpcoesCet = {},
): ResultadoCet {
  const periodosAno = opcoes.periodosAno ?? 12;
  const tol = new Decimal(opcoes.tolerancia ?? '1e-10');
  const maxIter = opcoes.maxIteracoes ?? 200;

  const vp = (i: Decimal): Decimal =>
    fluxos.reduce((acc, f) => acc.plus(f.valor.div(i.plus(1).pow(f.periodo))), new Decimal(0));

  const f = (i: Decimal): Decimal => vp(i).minus(valorLiberado);

  const df = (i: Decimal): Decimal =>
    fluxos.reduce(
      (acc, fx) => acc.minus(fx.valor.times(fx.periodo).div(i.plus(1).pow(fx.periodo.plus(1)))),
      new Decimal(0),
    );

  // --- Newton-Raphson ---
  let i = new Decimal('0.01');
  let convergiu = false;
  const limiteInf = new Decimal(LIMITE_INFERIOR);

  for (let k = 0; k < maxIter; k++) {
    const fi = f(i);
    if (fi.abs().lessThan(tol)) {
      convergiu = true;
      break;
    }
    const dfi = df(i);
    if (dfi.isZero()) {
      break;
    }
    let prox = i.minus(fi.div(dfi));
    if (prox.lessThanOrEqualTo(limiteInf)) {
      break; // sai do dominio valido -> usa bissecao
    }
    if (prox.minus(i).abs().lessThan(tol)) {
      i = prox;
      convergiu = true;
      break;
    }
    i = prox;
  }

  // --- Fallback: bissecao ---
  if (!convergiu) {
    i = bisseccao(f, new Decimal('-0.9999'), new Decimal('100'), tol, 1000);
  }

  const mensal = i;
  const anual = mensal.plus(1).pow(periodosAno).minus(1);
  return { mensal, anual };
}

function bisseccao(
  f: (x: Decimal) => Decimal,
  baixoInit: Decimal,
  altoInit: Decimal,
  tol: Decimal,
  maxIter: number,
): Decimal {
  let baixo = baixoInit;
  let alto = altoInit;
  let fBaixo = f(baixo);
  let fAlto = f(alto);

  if (fBaixo.times(fAlto).greaterThan(0)) {
    throw new Error('CET: nao foi possivel isolar a raiz (sem troca de sinal no intervalo).');
  }

  let meio = baixo.plus(alto).div(2);
  for (let k = 0; k < maxIter; k++) {
    meio = baixo.plus(alto).div(2);
    const fMeio = f(meio);
    if (fMeio.abs().lessThan(tol) || alto.minus(baixo).abs().lessThan(tol)) {
      return meio;
    }
    if (fBaixo.times(fMeio).lessThan(0)) {
      alto = meio;
      fAlto = fMeio;
    } else {
      baixo = meio;
      fBaixo = fMeio;
    }
  }
  return meio;
}
