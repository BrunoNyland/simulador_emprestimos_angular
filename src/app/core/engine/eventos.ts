import { Decimal, arredondarMoeda } from './decimal.config';
import { OpcaoAmortizacao, Parcela, SistemaAmortizacao } from './models';
import { adicionarMeses, diasCorridos } from './dates';
import { gerarCronogramaPrice, valorParcelaPrice } from './price';
import { gerarCronogramaSac } from './sac';
import { somarTotais } from './totais';
import { calcularCet, FluxoCaixa } from './cet';
import { disp, montarTrace, passoCalculo, passoNota, TraceCalculo } from './trace';

/**
 * Como interpretar o valor digitado numa amortização extra feita no meio do
 * período (CALC_REF secao 9):
 * - `amortizado`: o valor é o que abate do PRINCIPAL; os juros pro-rata corridos
 *   entram por cima (caixa = principal + juros). Espelha a quitação.
 * - `pago`: o valor é o TOTAL pago (caixa); ele cobre primeiro os juros pro-rata
 *   corridos e o restante abate o principal (juros + amortização = pago).
 */
export type BaseAmortizacao = 'pago' | 'amortizado';

/**
 * Eventos pos-simulacao (CALCULATION_REFERENCE.md secao 9), DIRIGIDOS POR DATA.
 * A data de lançamento é a referência: o motor a converte para o ponto do
 * cronograma (parcela + fração de período decorrida) e calcula os juros
 * pro-rata corridos como na vida real.
 */
export type EventoCalc =
  | { tipo: 'amortizacao'; data: string; valor: string; base: BaseAmortizacao; opcao: OpcaoAmortizacao }
  | { tipo: 'quitacao'; data: string }
  | { tipo: 'antecipacao'; data: string; quantidade: number; opcao?: OpcaoAmortizacao }
  | { tipo: 'pagamento'; dataVencimento: string; dataPagamento: string; valorPago?: string };

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
 * Converte uma data de lançamento no ponto do cronograma:
 * - `apos`: nº da última parcela cujo vencimento é <= data (0 = antes da 1ª);
 * - `fracao`: fração do período já decorrida entre essa parcela e a próxima
 *   (dias/30, no padrão mensal 30/360; saturada < 1 para não "virar" o período).
 * É a base do pro-rata: data no meio do mês => juros proporcionais aos dias.
 */
export function mapearData(
  dataBase: string,
  prazo: number,
  data: string,
): { apos: number; fracao: Decimal } {
  let apos = 0;
  for (let k = 1; k <= prazo; k++) {
    if (adicionarMeses(dataBase, k) <= data) {
      apos = k;
    } else {
      break;
    }
  }
  const vencApos = apos === 0 ? dataBase : adicionarMeses(dataBase, apos);
  const dias = Math.max(0, diasCorridos(vencApos, data));
  let fracao = new Decimal(Math.min(dias, 30)).div(30);
  if (fracao.greaterThanOrEqualTo(1)) {
    fracao = new Decimal('0.999999');
  }
  return { apos, fracao };
}

/** Evento já posicionado no cronograma (parcela + fração do período). */
interface EventoPosicionado {
  apos: number;
  frac: Decimal;
  ev: EventoCalc;
}

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

  // Posiciona cada evento pela sua DATA (vencimento, no caso da cobrança).
  const posicionados: EventoPosicionado[] = eventos.map((ev) => {
    const dataRef = ev.tipo === 'pagamento' ? ev.dataVencimento : ev.data;
    const { apos, fracao } = mapearData(dataBase, n, dataRef);
    return { apos, frac: fracao, ev };
  });
  const eventosApos = (k: number): EventoPosicionado[] =>
    posicionados.filter((p) => p.apos === k);

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
  // `ajusteVelhoPago`: o pro-rata do saldo antigo JA foi liquidado no evento
  // (amortizacao), entao a proxima parcela so cobra o restante sobre o saldo novo.
  let ajusteAtivo = false;
  let ajusteSaldoAntes = new Decimal(0);
  let ajusteFrac = new Decimal(0);
  let ajusteVelhoPago = false;
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
    for (const { ev, frac } of eventosApos(numeroAtual)) {
      if (ev.tipo === 'amortizacao') {
        // Pro-rata: na vida real, pagar no meio do mês acerta os juros corridos
        // desde a última parcela. O motor liquida esses juros AQUI (no evento) e
        // a próxima parcela cobra só o restante do período sobre o saldo novo.
        const saldoAntes = saldo;
        const jurosPro = frac.greaterThan(0)
          ? arredondarMoeda(saldoAntes.times(i).times(frac))
          : new Decimal(0);
        let amort: Decimal;
        let pago: Decimal;
        if (ev.base === 'amortizado') {
          // valor = principal a abater; juros corridos entram por cima.
          amort = Decimal.min(new Decimal(ev.valor), saldoAntes);
          pago = amort.plus(jurosPro);
        } else {
          // valor = total pago; cobre os juros corridos e o resto abate principal.
          pago = new Decimal(ev.valor);
          amort = pago.minus(jurosPro);
          if (amort.lessThanOrEqualTo(0)) {
            throw new Error('Amortizacao: total pago nao cobre os juros pro-rata do periodo.');
          }
          amort = Decimal.min(amort, saldoAntes);
        }
        saldo = saldoAntes.minus(amort);
        extras = extras.plus(amort);
        jurosExtras = jurosExtras.plus(jurosPro);
        if (ev.opcao === 'reduzir-prazo') {
          prazoAlvo = null;
        } else {
          reamortizar(numeroAtual);
        }
        fluxos.push({ periodo: periodoFluxo(numeroAtual, frac), valor: pago });
        if (frac.greaterThan(0)) {
          ajusteAtivo = true;
          ajusteSaldoAntes = saldoAntes;
          ajusteFrac = frac;
          ajusteVelhoPago = true; // pro-rata do saldo antigo ja foi pago no evento
        }
        const nota = frac.greaterThan(0) ? ` (+ juros pro-rata ${jurosPro.toFixed(2)})` : '';
        marcar(linha, `Amortizacao extra ${amort.toFixed(2)} (${rotuloOpcao(ev.opcao)})${nota}`);
        const passos = [
          passoNota('base', ev.base === 'amortizado'
            ? 'Você informou quanto abater do principal; os juros pro-rata corridos no período entram por cima.'
            : 'Você informou o total pago no dia; ele cobre primeiro os juros pro-rata corridos e o restante abate o principal.'),
        ];
        if (frac.greaterThan(0)) {
          passos.push(passoCalculo('juros', 'Juros pro-rata corridos desde a última parcela (fração do mês)',
            'J = saldo × i × f', `${disp(saldoAntes, 2)} × ${disp(i)} × ${disp(frac, 4)}`, jurosPro, 2));
        }
        passos.push(
          passoCalculo('amort', 'Parte que efetivamente abate o saldo devedor',
            ev.base === 'amortizado' ? 'A = min(valor, saldo)' : 'A = pago − juros',
            ev.base === 'amortizado'
              ? `min(${disp(new Decimal(ev.valor), 2)}, ${disp(saldoAntes, 2)})`
              : `${disp(pago, 2)} − ${disp(jurosPro, 2)}`,
            amort, 2),
          passoCalculo('pago', 'Total desembolsado no dia (caixa)',
            'pago = juros + amortização', `${disp(jurosPro, 2)} + ${disp(amort, 2)}`, pago, 2),
          passoCalculo('saldo', 'Saldo devedor após a amortização',
            'saldo − A', `${disp(saldoAntes, 2)} − ${disp(amort, 2)}`, saldoAntes.minus(amort), 2),
          passoNota('opcao', ev.opcao === 'reduzir-prazo'
            ? 'Opção "reduzir prazo": a parcela continua a mesma e o empréstimo termina antes.'
            : 'Opção "reduzir parcela": o prazo continua o mesmo e as próximas parcelas ficam menores.'),
        );
        addTraco(linha, montarTrace('evento-amortizacao', `Amortização extra em ${ev.data}`,
          'pago = juros pro-rata + amortização', passos));
        addDetalhe(linha, {
          tipo: 'amortizacao',
          data: ev.data,
          descricao: `Amortização extra · ${rotuloOpcao(ev.opcao)}`,
          juros: jurosPro.toFixed(2),
          amortizacao: arredondarMoeda(amort).toFixed(2),
          valor: arredondarMoeda(pago).toFixed(2),
          saldoApos: arredondarMoeda(saldoAntes.minus(amort)).toFixed(2),
        });
      } else if (ev.tipo === 'antecipacao') {
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
          ajusteVelhoPago = false;
        }
        const nota = frac.greaterThan(0) ? ` pro-rata ${frac.toDecimalPlaces(4)}` : '';
        marcar(linha, `Antecipacao de ${ev.quantidade} parcela(s): VP ${v.toFixed(2)}${nota}`);
        addTraco(
          linha,
          montarTrace('evento-antecipacao', `Antecipação de ${ev.quantidade} parcela(s) em ${ev.data}`,
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
          data: ev.data,
          descricao: `Antecipação de ${ev.quantidade} parcela(s)`,
          juros: '0.00',
          amortizacao: arredondarMoeda(v).toFixed(2),
          valor: arredondarMoeda(v).toFixed(2),
          saldoApos: arredondarMoeda(saldoAntes.minus(v)).toFixed(2),
        });
      } else if (ev.tipo === 'quitacao') {
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
        addTraco(linha, montarTrace('evento-quitacao', `Quitação antecipada em ${ev.data}`, 'payoff = saldo (+ juros pro-rata)', passosQuit));
        addDetalhe(linha, {
          tipo: 'quitacao',
          data: ev.data,
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
        // Atraso = dias corridos entre o vencimento e o pagamento efetivo.
        const diasAtraso = Math.max(0, diasCorridos(ev.dataVencimento, ev.dataPagamento));

        // Pagamento parcial: re-define a amortizacao desta parcela.
        if (ev.valorPago !== undefined && ev.valorPago !== '') {
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
            data: ev.dataPagamento,
            descricao: 'Pagamento parcial',
            juros: arredondarMoeda(juros).toFixed(2),
            amortizacao: arredondarMoeda(amort).toFixed(2),
            valor: arredondarMoeda(amort.plus(juros)).toFixed(2),
            saldoApos: arredondarMoeda(saldo).toFixed(2),
          });
        }

        // Mora por atraso (calculada sobre a parcela agendada).
        if (diasAtraso > 0 && mora) {
          const multa = agendada.times(mora.multa);
          const jurosMora = agendada
            .times(mora.jurosMensal)
            .times(new Decimal(diasAtraso).div(30));
          const moraTotal = arredondarMoeda(multa.plus(jurosMora));
          encargos = encargos.plus(moraTotal);
          linha.encargos = moraTotal.toFixed(2);
          linha.valorParcela = arredondarMoeda(
            new Decimal(linha.valorParcela).plus(moraTotal),
          ).toFixed(2);
          marcar(linha, `Atraso ${diasAtraso} dia(s): mora ${moraTotal.toFixed(2)}`);
          addTraco(
            linha,
            montarTrace('evento-mora', `Atraso de ${diasAtraso} dia(s) na parcela ${numeroAtual}`,
              'encargo = multa + juros de mora', [
                passoCalculo('multa', 'Multa de mora sobre o valor da parcela (CDC: até 2%)',
                  'multa = parcela × m', `${disp(agendada, 2)} × ${disp(mora.multa)}`, arredondarMoeda(multa), 2),
                passoCalculo('jurosMora', 'Juros de mora proporcionais aos dias de atraso',
                  'j = parcela × i_mora × dias/30', `${disp(agendada, 2)} × ${disp(mora.jurosMensal)} × ${diasAtraso}/30`, arredondarMoeda(jurosMora), 2),
                passoCalculo('total', 'Encargo total somado ao valor da parcela',
                  'multa + j', `${disp(arredondarMoeda(multa), 2)} + ${disp(arredondarMoeda(jurosMora), 2)}`, moraTotal, 2),
              ]),
          );
          addDetalhe(linha, {
            tipo: 'pagamento',
            data: ev.dataPagamento,
            descricao: `Atraso de ${diasAtraso} dia(s) · multa + mora`,
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
      // Pro-rata do período em que houve um evento. O saldo novo sempre paga o
      // restante do mês; o termo do saldo antigo (fração decorrida) só entra se
      // ainda NÃO tiver sido liquidado no próprio evento (amortização já paga).
      const termoNovo = saldoInicial.times(i).times(new Decimal(1).minus(ajusteFrac));
      const termoVelho = ajusteVelhoPago
        ? new Decimal(0)
        : ajusteSaldoAntes.times(i).times(ajusteFrac);
      juros = arredondarMoeda(termoVelho.plus(termoNovo));
      ajusteAtivo = false;
      ajusteVelhoPago = false;
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
