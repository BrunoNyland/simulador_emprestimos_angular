import { Decimal, arredondarMoeda } from './decimal.config';
import { OpcaoAmortizacao, Parcela, SistemaAmortizacao } from './models';
import { adicionarMeses } from './dates';
import { gerarCronogramaPrice, valorParcelaPrice } from './price';
import { gerarCronogramaSac } from './sac';
import { somarTotais } from './totais';
import { calcularCet, FluxoCaixa } from './cet';

/**
 * Eventos pos-simulacao (CALCULATION_REFERENCE.md secao 9).
 * `apos` = numero da parcela apos a qual o evento ocorre (0 = antes da 1a).
 */
export type EventoCalc =
  | { tipo: 'amortizacao'; apos: number; valor: string; opcao: OpcaoAmortizacao }
  | { tipo: 'quitacao'; apos: number; fracaoPeriodo?: string }
  | { tipo: 'antecipacao'; apos: number; quantidade: number; opcao?: OpcaoAmortizacao }
  | { tipo: 'pagamento'; apos: number; diasAtraso: number; valorPago?: string };

/** Linha do cronograma com observacao opcional (evento aplicado). */
export interface LinhaCronograma extends Parcela {
  observacao?: string;
}

export interface ParametrosMora {
  jurosMensal: Decimal;
  multa: Decimal;
}

export interface EntradaProjecao {
  principal: Decimal;
  taxaPeriodo: Decimal;
  prazo: number;
  sistema: SistemaAmortizacao;
  eventos: EventoCalc[];
  dataBase?: string;
  mora?: ParametrosMora;
}

export interface ResumoProjecao {
  totalJuros: string;
  totalAmortizacao: string;
  totalEncargos: string;
  totalPago: string;
  amortizacoesExtras: string;
  economiaJuros: string;
  prazoFinal: number;
  /** CET do fluxo real (com pre-pagamentos); liberado = principal (sem IOF). */
  cetMensal: string;
  cetAnual: string;
}

export interface ResultadoProjecao {
  parcelas: LinhaCronograma[];
  resumo: ResumoProjecao;
}

const QUASE_ZERO = new Decimal('0.005');

/**
 * Projeta o cronograma aplicando eventos de forma deterministica.
 * O cronograma e funcao pura de (base + eventos): cancelar um evento e
 * apenas reprojetar sem ele (CALC_REF secao 9.5).
 */
export function projetarComEventos(e: EntradaProjecao): ResultadoProjecao {
  const { principal, taxaPeriodo: i, prazo: n, sistema, eventos, dataBase, mora } = e;
  if (sistema !== 'price' && sistema !== 'sac') {
    throw new Error('Eventos: sistema deve ser price ou sac.');
  }
  if (n < 1) {
    throw new Error('Prazo deve ser >= 1.');
  }

  // Baseline (sem eventos) para a economia de juros.
  const base =
    sistema === 'price'
      ? gerarCronogramaPrice({ principal, taxaPeriodo: i, prazo: n })
      : gerarCronogramaSac({ principal, taxaPeriodo: i, prazo: n });
  const jurosBase = new Decimal(somarTotais(base).totalJuros);

  const eventosApos = (k: number): EventoCalc[] => eventos.filter((ev) => ev.apos === k);

  let saldo = principal;
  let prazoAlvo: number | null = n; // null => prazo aberto (reduzir-prazo)
  let pmt =
    sistema === 'price' ? arredondarMoeda(valorParcelaPrice(principal, i, n)) : new Decimal(0);
  let amortConst = sistema === 'sac' ? arredondarMoeda(principal.div(n)) : new Decimal(0);

  const parcelas: LinhaCronograma[] = [];
  const fluxos: FluxoCaixa[] = []; // fluxo de caixa do cliente p/ o CET
  let extras = new Decimal(0); // principal amortizado fora das parcelas
  let jurosExtras = new Decimal(0); // juros pro-rata (ex.: quitacao no meio do periodo)
  let encargos = new Decimal(0);
  const CAP = n * 2 + 12;

  const reamortizar = (numeroAtual: number): void => {
    const restantes = (prazoAlvo ?? n) - numeroAtual;
    if (restantes >= 1 && saldo.greaterThan(QUASE_ZERO)) {
      if (sistema === 'price') {
        pmt = arredondarMoeda(valorParcelaPrice(saldo, i, restantes));
      } else {
        amortConst = arredondarMoeda(saldo.div(restantes));
      }
    }
  };

  const prepagar = (valor: Decimal, opcao: OpcaoAmortizacao, numeroAtual: number): Decimal => {
    const v = Decimal.min(valor, saldo);
    saldo = saldo.minus(v);
    extras = extras.plus(v);
    if (opcao === 'reduzir-prazo') {
      prazoAlvo = null;
    } else {
      reamortizar(numeroAtual);
    }
    return v;
  };

  /** Valor presente das proximas `quantidade` parcelas (Price ou SAC). */
  const pvProximasParcelas = (quantidade: number): Decimal => {
    let pv = new Decimal(0);
    if (sistema === 'price') {
      for (let j = 1; j <= quantidade; j++) {
        pv = pv.plus(pmt.div(i.plus(1).pow(j)));
      }
    } else {
      let s = saldo;
      for (let j = 1; j <= quantidade && s.greaterThan(QUASE_ZERO); j++) {
        const juros = s.times(i);
        const amort = Decimal.min(amortConst, s);
        pv = pv.plus(amort.plus(juros).div(i.plus(1).pow(j)));
        s = s.minus(amort);
      }
    }
    return pv;
  };

  const aplicarEventos = (numeroAtual: number, linha?: LinhaCronograma): void => {
    for (const ev of eventosApos(numeroAtual)) {
      if (ev.tipo === 'amortizacao') {
        const v = prepagar(new Decimal(ev.valor), ev.opcao, numeroAtual);
        fluxos.push({ periodo: new Decimal(numeroAtual), valor: v });
        marcar(linha, `Amortizacao extra ${v.toFixed(2)} (${rotuloOpcao(ev.opcao)})`);
      } else if (ev.tipo === 'antecipacao') {
        const v = prepagar(pvProximasParcelas(ev.quantidade), ev.opcao ?? 'reduzir-prazo', numeroAtual);
        fluxos.push({ periodo: new Decimal(numeroAtual), valor: v });
        marcar(linha, `Antecipacao de ${ev.quantidade} parcela(s): VP ${v.toFixed(2)}`);
      } else if (ev.tipo === 'quitacao') {
        const frac = new Decimal(ev.fracaoPeriodo ?? '0');
        const payoff = frac.greaterThan(0) ? saldo.times(i.plus(1).pow(frac)) : saldo;
        extras = extras.plus(saldo); // principal
        jurosExtras = jurosExtras.plus(payoff.minus(saldo)); // juros pro-rata
        fluxos.push({ periodo: new Decimal(numeroAtual).plus(frac), valor: payoff });
        saldo = new Decimal(0);
        const nota = frac.greaterThan(0) ? ` (pro-rata ${frac.toDecimalPlaces(4)} periodo)` : '';
        marcar(linha, `Quitacao antecipada: ${arredondarMoeda(payoff).toFixed(2)}${nota}`);
      } else if (ev.tipo === 'pagamento') {
        if (!linha) {
          continue;
        }
        const saldoInicial = new Decimal(linha.saldoInicial);
        const juros = new Decimal(linha.juros);
        const agendada = new Decimal(linha.valorParcela);

        // Pagamento parcial: re-define a amortizacao desta parcela.
        if (ev.valorPago !== undefined) {
          const pago = new Decimal(ev.valorPago);
          let amort = pago.minus(juros);
          if (amort.lessThanOrEqualTo(0)) {
            throw new Error('Pagamento inferior aos juros: amortizacao negativa nao permitida.');
          }
          if (amort.greaterThan(saldoInicial)) {
            amort = saldoInicial;
          }
          saldo = saldoInicial.minus(amort);
          linha.amortizacao = arredondarMoeda(amort).toFixed(2);
          linha.valorParcela = arredondarMoeda(amort.plus(juros)).toFixed(2);
          linha.saldoFinal = arredondarMoeda(saldo).toFixed(2);
          reamortizar(numeroAtual); // mantem o prazo; parcelas seguintes ajustam
          marcar(linha, `Pagamento parcial ${arredondarMoeda(amort.plus(juros)).toFixed(2)}`);
        }

        // Mora por atraso (calculada sobre a parcela agendada).
        if (ev.diasAtraso > 0 && mora) {
          const multa = agendada.times(mora.multa);
          const jurosMora = agendada.times(mora.jurosMensal).times(new Decimal(ev.diasAtraso).div(30));
          const moraTotal = arredondarMoeda(multa.plus(jurosMora));
          encargos = encargos.plus(moraTotal);
          linha.encargos = moraTotal.toFixed(2);
          linha.valorParcela = arredondarMoeda(new Decimal(linha.valorParcela).plus(moraTotal)).toFixed(2);
          marcar(linha, `Atraso ${ev.diasAtraso} dia(s): mora ${moraTotal.toFixed(2)}`);
        }
      }
    }
  };

  // Eventos antes da 1a parcela.
  aplicarEventos(0, undefined);

  let numero = 0;
  while (saldo.greaterThan(QUASE_ZERO) && numero < CAP) {
    numero++;
    const saldoInicial = saldo;
    const juros = arredondarMoeda(saldoInicial.times(i));

    let amort: Decimal;
    if (sistema === 'price') {
      amort = prazoAlvo !== null && numero >= prazoAlvo ? saldoInicial : pmt.minus(juros);
    } else {
      amort = prazoAlvo !== null && numero >= prazoAlvo ? saldoInicial : amortConst;
    }
    if (amort.greaterThanOrEqualTo(saldoInicial)) {
      amort = saldoInicial;
    }
    if (amort.lessThanOrEqualTo(0)) {
      throw new Error('Parcela insuficiente para amortizar (amortizacao <= 0).');
    }

    saldo = saldoInicial.minus(amort);
    const linha: LinhaCronograma = {
      numero,
      dataVencimento: dataBase ? adicionarMeses(dataBase, numero) : '',
      saldoInicial: arredondarMoeda(saldoInicial).toFixed(2),
      juros: juros.toFixed(2),
      amortizacao: arredondarMoeda(amort).toFixed(2),
      encargos: '0.00',
      valorParcela: arredondarMoeda(amort.plus(juros)).toFixed(2),
      saldoFinal: arredondarMoeda(saldo).toFixed(2),
    };
    parcelas.push(linha);

    aplicarEventos(numero, linha);

    // Fluxo da parcela (apos eventuais ajustes de pagamento/mora).
    fluxos.push({ periodo: new Decimal(numero), valor: new Decimal(linha.valorParcela) });

    if (saldo.lessThanOrEqualTo(QUASE_ZERO)) {
      break;
    }
  }

  const totais = somarTotais(parcelas);
  const totalAmortizacao = new Decimal(totais.totalAmortizacao).plus(extras);
  const totalJuros = new Decimal(totais.totalJuros).plus(jurosExtras);
  const totalPago = new Decimal(totais.totalParcelas).plus(extras).plus(jurosExtras);

  // CET do fluxo real (sem IOF/encargos de abertura nesta fase).
  let cetMensal = '';
  let cetAnual = '';
  if (fluxos.length > 0) {
    try {
      const cet = calcularCet(principal, fluxos);
      cetMensal = cet.mensal.toDecimalPlaces(6).toString();
      cetAnual = cet.anual.toDecimalPlaces(6).toString();
    } catch {
      cetMensal = '';
      cetAnual = '';
    }
  }

  return {
    parcelas,
    resumo: {
      totalJuros: totalJuros.toFixed(2),
      totalAmortizacao: totalAmortizacao.toFixed(2),
      totalEncargos: encargos.toFixed(2),
      totalPago: totalPago.toFixed(2),
      amortizacoesExtras: extras.toFixed(2),
      economiaJuros: jurosBase.minus(totalJuros).toFixed(2),
      prazoFinal: parcelas.length,
      cetMensal,
      cetAnual,
    },
  };
}

function rotuloOpcao(opcao: OpcaoAmortizacao): string {
  return opcao === 'reduzir-prazo' ? 'reduzir prazo' : 'reduzir parcela';
}

function marcar(linha: LinhaCronograma | undefined, texto: string): void {
  if (!linha) {
    return;
  }
  linha.observacao = linha.observacao ? `${linha.observacao}; ${texto}` : texto;
}
