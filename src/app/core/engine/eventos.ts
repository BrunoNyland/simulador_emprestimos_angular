import { Decimal, arredondarMoeda } from './decimal.config';
import { OpcaoAmortizacao, Parcela, SistemaAmortizacao } from './models';
import { adicionarMeses, diasCorridos } from './dates';
import { gerarCronogramaPrice, valorParcelaPrice } from './price';
import { gerarCronogramaSac } from './sac';
import { somarTotais } from './totais';
import { calcularCet, FluxoCaixa } from './cet';
import { disp, montarTrace, passoCalculo, passoNota, TraceCalculo } from './trace';

/**
 * Eventos pos-simulacao (CALCULATION_REFERENCE.md secao 9).
 * `apos` = numero da parcela apos a qual o evento ocorre (0 = antes da 1a).
 */
export type EventoCalc =
  | { tipo: 'amortizacao'; apos: number; valor: string; opcao: OpcaoAmortizacao; fracaoPeriodo?: string }
  | { tipo: 'quitacao'; apos: number; fracaoPeriodo?: string }
  | {
      tipo: 'antecipacao';
      apos: number;
      quantidade: number;
      opcao?: OpcaoAmortizacao;
      fracaoPeriodo?: string;
    }
  | { tipo: 'pagamento'; apos: number; diasAtraso: number; valorPago?: string };

/**
 * Resumo de um evento aplicado a uma linha, ALINHADO às colunas das parcelas
 * (data, juros, amortização, valor pago e saldo após), para virar uma linha
 * própria na tabela do cronograma pós-eventos.
 */
export interface DetalheEvento {
  tipo: EventoCalc['tipo'];
  /** Data em que o evento ocorre (ISO). */
  data: string;
  /** Rótulo curto do evento. */
  descricao: string;
  /** Componente de juros do evento (mora/pro-rata); '0.00' se não houver. */
  juros: string;
  /** Principal movimentado pelo evento; '0.00' se não houver. */
  amortizacao: string;
  /** Caixa total pago no evento. */
  valor: string;
  /** Saldo devedor após o evento. */
  saldoApos: string;
}

/** Linha do cronograma com observacao opcional (evento aplicado). */
export interface LinhaCronograma extends Parcela {
  observacao?: string;
  /**
   * Traços de cálculo dos eventos aplicados nesta linha (multa de mora, payoff
   * de quitação, valor amortizado, etc.), com os números reais do motor. A UI
   * os exibe ao clicar na linha — mesma transparência da simulação base.
   */
  tracosEvento?: TraceCalculo[];
  /** Resumo alinhado de cada evento, para exibir como linha própria na tabela. */
  detalhes?: DetalheEvento[];
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
  /** Data de liberacao (ISO). Obrigatoria: o CET usa dias corridos/365 (BACEN). */
  dataBase: string;
  mora?: ParametrosMora;
  /** Valor efetivamente liberado ao cliente (base do CET). Default: principal. */
  valorLiberado?: Decimal;
  /**
   * Pula o cálculo do CET (TIR/365), que é caro. Usado quando a projeção serve
   * apenas para validar um lançamento (precisamos do saldo/parcelas, não do CET).
   */
  omitirCet?: boolean;
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
  if (!dataBase) {
    throw new Error('Eventos: dataBase (data de liberacao) e obrigatoria para o CET BACEN.');
  }

  // Baseline (sem eventos) para a economia de juros.
  const base =
    sistema === 'price'
      ? gerarCronogramaPrice({ principal, taxaPeriodo: i, prazo: n })
      : gerarCronogramaSac({ principal, taxaPeriodo: i, prazo: n });
  const jurosBase = new Decimal(somarTotais(base).totalJuros);

  const eventosApos = (k: number): EventoCalc[] => eventos.filter((ev) => ev.apos === k);

  // Periodo de um fluxo para o CET, no padrao BACEN: dias corridos / 365.
  const periodoFluxo = (k: number, frac: Decimal): Decimal => {
    const vencK = k === 0 ? dataBase : adicionarMeses(dataBase, k);
    const diasBase = new Decimal(diasCorridos(dataBase, vencK));
    if (frac.lessThanOrEqualTo(0)) {
      return diasBase.div(365);
    }
    const diasPeriodo = new Decimal(diasCorridos(vencK, adicionarMeses(dataBase, k + 1)));
    return diasBase.plus(frac.times(diasPeriodo)).div(365);
  };

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
  // Quando um pre-pagamento ocorre no meio do periodo, a proxima parcela divide
  // os juros entre o saldo antigo (fracao decorrida) e o novo (restante).
  let ajusteAtivo = false;
  let ajusteSaldoAntes = new Decimal(0);
  let ajusteFrac = new Decimal(0);
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
        const frac = new Decimal(ev.fracaoPeriodo ?? '0');
        const saldoAntes = saldo;
        const v = prepagar(new Decimal(ev.valor), ev.opcao, numeroAtual);
        fluxos.push({ periodo: periodoFluxo(numeroAtual, frac), valor: v });
        if (frac.greaterThan(0)) {
          ajusteAtivo = true;
          ajusteSaldoAntes = saldoAntes;
          ajusteFrac = frac;
        }
        const nota = frac.greaterThan(0) ? ` pro-rata ${frac.toDecimalPlaces(4)}` : '';
        marcar(linha, `Amortizacao extra ${v.toFixed(2)} (${rotuloOpcao(ev.opcao)})${nota}`);
        addTraco(
          linha,
          montarTrace('evento-amortizacao', `Amortização extra após a parcela ${numeroAtual}`,
            'novo saldo = saldo − valor amortizado', [
              passoCalculo('valor', 'Valor amortizado, limitado ao saldo devedor atual',
                'v = min(valor solicitado, saldo)', `min(${disp(new Decimal(ev.valor), 2)}, ${disp(saldoAntes, 2)})`, v, 2),
              passoCalculo('saldo', 'Saldo devedor após a amortização extra',
                'saldo − v', `${disp(saldoAntes, 2)} − ${disp(v, 2)}`, saldoAntes.minus(v), 2),
              passoNota('opcao', ev.opcao === 'reduzir-prazo'
                ? 'Opção "reduzir prazo": a parcela continua a mesma e o empréstimo termina antes.'
                : 'Opção "reduzir parcela": o prazo continua o mesmo e as próximas parcelas ficam menores.'),
            ]),
        );
        addDetalhe(linha, {
          tipo: 'amortizacao',
          data: linha?.dataVencimento ?? dataBase,
          descricao: `Amortização extra · ${rotuloOpcao(ev.opcao)}`,
          juros: '0.00',
          amortizacao: arredondarMoeda(v).toFixed(2),
          valor: arredondarMoeda(v).toFixed(2),
          saldoApos: arredondarMoeda(saldoAntes.minus(v)).toFixed(2),
        });
      } else if (ev.tipo === 'antecipacao') {
        const frac = new Decimal(ev.fracaoPeriodo ?? '0');
        const saldoAntes = saldo;
        const v = prepagar(
          pvProximasParcelas(ev.quantidade),
          ev.opcao ?? 'reduzir-prazo',
          numeroAtual,
        );
        fluxos.push({ periodo: periodoFluxo(numeroAtual, frac), valor: v });
        if (frac.greaterThan(0)) {
          ajusteAtivo = true;
          ajusteSaldoAntes = saldoAntes;
          ajusteFrac = frac;
        }
        const nota = frac.greaterThan(0) ? ` pro-rata ${frac.toDecimalPlaces(4)}` : '';
        marcar(linha, `Antecipacao de ${ev.quantidade} parcela(s): VP ${v.toFixed(2)}${nota}`);
        addTraco(
          linha,
          montarTrace('evento-antecipacao', `Antecipação de ${ev.quantidade} parcela(s) após a parcela ${numeroAtual}`,
            'paga-se hoje o VALOR PRESENTE das próximas parcelas', [
              passoNota('vp', `Antecipar parcelas futuras não custa a soma nominal delas: traz-se cada uma a valor de hoje descontando os juros, somando o valor presente (VP) das ${ev.quantidade} próximas.`),
              passoCalculo('valor', 'Valor presente das parcelas antecipadas (limitado ao saldo)',
                'VP = Σ parcela / (1+i)^j', `i = ${disp(i)}`, v, 2),
              passoCalculo('saldo', 'Saldo devedor após a antecipação',
                'saldo − VP', `${disp(saldoAntes, 2)} − ${disp(v, 2)}`, saldoAntes.minus(v), 2),
            ]),
        );
        addDetalhe(linha, {
          tipo: 'antecipacao',
          data: linha?.dataVencimento ?? dataBase,
          descricao: `Antecipação de ${ev.quantidade} parcela(s)`,
          juros: '0.00',
          amortizacao: arredondarMoeda(v).toFixed(2),
          valor: arredondarMoeda(v).toFixed(2),
          saldoApos: arredondarMoeda(saldoAntes.minus(v)).toFixed(2),
        });
      } else if (ev.tipo === 'quitacao') {
        const frac = new Decimal(ev.fracaoPeriodo ?? '0');
        const saldoQuit = saldo;
        const payoff = frac.greaterThan(0) ? saldo.times(i.plus(1).pow(frac)) : saldo;
        extras = extras.plus(saldo); // principal
        jurosExtras = jurosExtras.plus(payoff.minus(saldo)); // juros pro-rata
        fluxos.push({ periodo: periodoFluxo(numeroAtual, frac), valor: payoff });
        saldo = new Decimal(0);
        const nota = frac.greaterThan(0) ? ` (pro-rata ${frac.toDecimalPlaces(4)} periodo)` : '';
        marcar(linha, `Quitacao antecipada: ${arredondarMoeda(payoff).toFixed(2)}${nota}`);
        const passosQuit = frac.greaterThan(0)
          ? [
              passoCalculo('payoff', 'Valor para quitar no meio do período: saldo corrigido pelos juros pro-rata',
                'payoff = saldo × (1+i)^f', `${disp(saldoQuit, 2)} × (1+${disp(i)})^${disp(frac, 4)}`, arredondarMoeda(payoff), 2),
              passoCalculo('jurosProRata', 'Juros pro-rata embutidos (parte do mês já decorrida)',
                'payoff − saldo', `${disp(arredondarMoeda(payoff), 2)} − ${disp(saldoQuit, 2)}`, arredondarMoeda(payoff.minus(saldoQuit)), 2),
            ]
          : [
              passoCalculo('payoff', 'Valor para quitar na data de uma parcela: o próprio saldo devedor',
                'payoff = saldo', disp(saldoQuit, 2), arredondarMoeda(payoff), 2),
            ];
        addTraco(linha, montarTrace('evento-quitacao', `Quitação antecipada após a parcela ${numeroAtual}`, 'payoff = saldo (+ juros pro-rata)', passosQuit));
        addDetalhe(linha, {
          tipo: 'quitacao',
          data: linha?.dataVencimento ?? dataBase,
          descricao: frac.greaterThan(0) ? 'Quitação antecipada (pro-rata)' : 'Quitação antecipada',
          juros: arredondarMoeda(payoff.minus(saldoQuit)).toFixed(2),
          amortizacao: arredondarMoeda(saldoQuit).toFixed(2),
          valor: arredondarMoeda(payoff).toFixed(2),
          saldoApos: '0.00',
        });
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
          addTraco(
            linha,
            montarTrace('evento-pagamento-parcial', `Pagamento parcial na parcela ${numeroAtual}`,
              'amortização = valor pago − juros do mês', [
                passoNota('regra', 'Num pagamento parcial, primeiro quitam-se os juros do mês; o que sobra abate o principal. O prazo é mantido e as próximas parcelas se reajustam.'),
                passoCalculo('amort', 'Parte do pagamento que abate o saldo devedor',
                  'A = pago − juros', `${disp(pago, 2)} − ${disp(juros, 2)}`, arredondarMoeda(amort), 2),
                passoCalculo('saldo', 'Saldo devedor após o pagamento parcial',
                  'saldo inicial − A', `${disp(saldoInicial, 2)} − ${disp(arredondarMoeda(amort), 2)}`, arredondarMoeda(saldo), 2),
              ]),
          );
          addDetalhe(linha, {
            tipo: 'pagamento',
            data: linha.dataVencimento,
            descricao: 'Pagamento parcial',
            juros: arredondarMoeda(juros).toFixed(2),
            amortizacao: arredondarMoeda(amort).toFixed(2),
            valor: arredondarMoeda(amort.plus(juros)).toFixed(2),
            saldoApos: arredondarMoeda(saldo).toFixed(2),
          });
        }

        // Mora por atraso (calculada sobre a parcela agendada).
        if (ev.diasAtraso > 0 && mora) {
          const multa = agendada.times(mora.multa);
          const jurosMora = agendada
            .times(mora.jurosMensal)
            .times(new Decimal(ev.diasAtraso).div(30));
          const moraTotal = arredondarMoeda(multa.plus(jurosMora));
          encargos = encargos.plus(moraTotal);
          linha.encargos = moraTotal.toFixed(2);
          linha.valorParcela = arredondarMoeda(
            new Decimal(linha.valorParcela).plus(moraTotal),
          ).toFixed(2);
          marcar(linha, `Atraso ${ev.diasAtraso} dia(s): mora ${moraTotal.toFixed(2)}`);
          addTraco(
            linha,
            montarTrace('evento-mora', `Atraso de ${ev.diasAtraso} dia(s) na parcela ${numeroAtual}`,
              'encargo = multa + juros de mora', [
                passoCalculo('multa', 'Multa de mora sobre o valor da parcela (CDC: até 2%)',
                  'multa = parcela × m', `${disp(agendada, 2)} × ${disp(mora.multa)}`, arredondarMoeda(multa), 2),
                passoCalculo('jurosMora', 'Juros de mora proporcionais aos dias de atraso',
                  'j = parcela × i_mora × dias/30', `${disp(agendada, 2)} × ${disp(mora.jurosMensal)} × ${ev.diasAtraso}/30`, arredondarMoeda(jurosMora), 2),
                passoCalculo('total', 'Encargo total somado ao valor da parcela',
                  'multa + j', `${disp(arredondarMoeda(multa), 2)} + ${disp(arredondarMoeda(jurosMora), 2)}`, moraTotal, 2),
              ]),
          );
          addDetalhe(linha, {
            tipo: 'pagamento',
            data: linha.dataVencimento,
            descricao: `Atraso de ${ev.diasAtraso} dia(s) · multa + mora`,
            juros: moraTotal.toFixed(2),
            amortizacao: '0.00',
            valor: moraTotal.toFixed(2),
            saldoApos: linha.saldoFinal,
          });
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
    let juros: Decimal;
    if (ajusteAtivo) {
      // Pro-rata: juros do saldo antigo na fracao decorrida + saldo novo no restante.
      juros = arredondarMoeda(
        ajusteSaldoAntes
          .times(i)
          .times(ajusteFrac)
          .plus(saldoInicial.times(i).times(new Decimal(1).minus(ajusteFrac))),
      );
      ajusteAtivo = false;
    } else {
      juros = arredondarMoeda(saldoInicial.times(i));
    }

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
      dataVencimento: adicionarMeses(dataBase, numero),
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
    const dias = diasCorridos(dataBase, linha.dataVencimento);
    fluxos.push({ periodo: new Decimal(dias).div(365), valor: new Decimal(linha.valorParcela) });

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
  if (!e.omitirCet && fluxos.length > 0) {
    try {
      const cet = calcularCet(e.valorLiberado ?? principal, fluxos, { periodosAno: 1 });
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

function addTraco(linha: LinhaCronograma | undefined, traco: TraceCalculo): void {
  if (!linha) {
    return;
  }
  (linha.tracosEvento ??= []).push(traco);
}

function addDetalhe(linha: LinhaCronograma | undefined, detalhe: DetalheEvento): void {
  if (!linha) {
    return;
  }
  (linha.detalhes ??= []).push(detalhe);
}
