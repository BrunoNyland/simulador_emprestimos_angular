import { Decimal } from './decimal.config';

/** Um fluxo de caixa datado (em periodos-base a partir da liberacao). */
export interface FluxoCaixa {
  /** Prazo ate o fluxo, em periodos-base (ex.: dias/365 para CET BACEN, ou indice da parcela). */
  periodo: Decimal;
  /** Valor pago pelo cliente no periodo (parcela + encargos + tributos). */
  valor: Decimal;
}

export interface ResultadoCet {
  mensal: Decimal;
  anual: Decimal;
}

export interface OpcoesCet {
  /** Se os periodos fornecidos estao em anos (dias/365), i sera a taxa anual. Se for mensal, i sera mensal. */
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
/**
 * Construtor Decimal com precisão REDUZIDA (20 dígitos) só para a iteração da
 * TIR. As potências fracionárias `(1+i)^(dias/365)` são o gargalo do CET em
 * prazos longos, e seu custo cresce com a precisão. 20 dígitos é folgado para a
 * tolerância 1e-10 e para os 4-6 decimais exibidos — sem afetar o resultado.
 */
const DecimalCet = Decimal.clone({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

export function calcularCet(
  valorLiberadoIn: Decimal,
  fluxosIn: FluxoCaixa[],
  opcoes: OpcoesCet = {},
): ResultadoCet {
  // Se periodosAno = 1 (fluxos em dias/365), a TIR encontrada já é a taxa anual.
  // Se periodosAno = 12 (fluxos em meses), a TIR encontrada é mensal.
  const periodosAno = opcoes.periodosAno ?? 12;
  const tol = new DecimalCet(opcoes.tolerancia ?? '1e-10');
  const maxIter = opcoes.maxIteracoes ?? 200;

  // Converte as entradas para a precisão reduzida (cálculo intermediário).
  const valorLiberado = new DecimalCet(valorLiberadoIn.toString());
  const fluxos = fluxosIn.map((f) => ({
    periodo: new DecimalCet(f.periodo.toString()),
    valor: new DecimalCet(f.valor.toString()),
  }));

  const vp = (i: Decimal): Decimal =>
    fluxos.reduce((acc, f) => acc.plus(f.valor.div(i.plus(1).pow(f.periodo))), new DecimalCet(0));

  const f = (i: Decimal): Decimal => vp(i).minus(valorLiberado);

  const df = (i: Decimal): Decimal =>
    fluxos.reduce(
      (acc, fx) => acc.minus(fx.valor.times(fx.periodo).div(i.plus(1).pow(fx.periodo.plus(1)))),
      new DecimalCet(0),
    );

  // --- Newton-Raphson ---
  let i: Decimal = new DecimalCet('0.01');
  let convergiu = false;
  const limiteInf = new DecimalCet(LIMITE_INFERIOR);

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
    i = bisseccao(f, new DecimalCet('-0.9999'), new DecimalCet('100'), tol, 1000);
  }

  let mensal: Decimal;
  let anual: Decimal;

  if (periodosAno === 1) {
    // Calculo padrao BACEN p/ CET (periodos em anos = dias/365)
    anual = i;
    mensal = anual.plus(1).pow(new DecimalCet(1).div(12)).minus(1);
  } else {
    // Calculo mensalista tradicional
    mensal = i;
    anual = mensal.plus(1).pow(periodosAno).minus(1);
  }

  // Volta para o Decimal global (precisão padrão) na fronteira de saída.
  return { mensal: new Decimal(mensal.toString()), anual: new Decimal(anual.toString()) };
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
