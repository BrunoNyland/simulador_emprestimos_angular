import { Decimal, arredondarMoeda } from './decimal.config';
import { OpcaoAmortizacao, Parcela, SistemaAmortizacao } from './models';
import { adicionarMeses } from './dates';
import { gerarCronogramaPrice, valorParcelaPrice } from './price';
import { gerarCronogramaSac } from './sac';
import { somarTotais } from './totais';

/**
 * Eventos pos-simulacao (CALCULATION_REFERENCE.md secao 9).
 * `apos` = numero da parcela apos a qual o evento ocorre (0 = antes da 1a).
 */
export type EventoCalc =
  | { tipo: 'amortizacao'; apos: number; valor: string; opcao: OpcaoAmortizacao }
  | { tipo: 'quitacao'; apos: number }
  | { tipo: 'antecipacao'; apos: number; quantidade: number; opcao?: OpcaoAmortizacao }
  | { tipo: 'pagamento'; apos: number; diasAtraso: number };

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

  // Baseline (sem eventos) para calcular a economia de juros.
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
  let extras = new Decimal(0);
  let encargos = new Decimal(0);
  const CAP = n * 2 + 12;

  const prepagar = (valor: Decimal, opcao: OpcaoAmortizacao, numeroAtual: number): Decimal => {
    const v = Decimal.min(valor, saldo);
    saldo = saldo.minus(v);
    extras = extras.plus(v);
    if (opcao === 'reduzir-prazo') {
      prazoAlvo = null;
    } else {
      const restantes = (prazoAlvo ?? n) - numeroAtual;
      if (restantes >= 1 && saldo.greaterThan(QUASE_ZERO)) {
        if (sistema === 'price') {
          pmt = arredondarMoeda(valorParcelaPrice(saldo, i, restantes));
        } else {
          amortConst = arredondarMoeda(saldo.div(restantes));
        }
      }
    }
    return v;
  };

  const pvProximasParcelas = (quantidade: number): Decimal => {
    if (sistema !== 'price') {
      throw new Error('Antecipacao de parcelas disponivel apenas para Price nesta fase.');
    }
    let pv = new Decimal(0);
    for (let j = 1; j <= quantidade; j++) {
      pv = pv.plus(pmt.div(i.plus(1).pow(j)));
    }
    return pv;
  };

  const aplicarEventos = (numeroAtual: number, linha?: LinhaCronograma): void => {
    for (const ev of eventosApos(numeroAtual)) {
      if (ev.tipo === 'amortizacao') {
        const v = prepagar(new Decimal(ev.valor), ev.opcao, numeroAtual);
        marcar(linha, `Amortizacao extra ${v.toFixed(2)} (${rotuloOpcao(ev.opcao)})`);
      } else if (ev.tipo === 'antecipacao') {
        const v = prepagar(pvProximasParcelas(ev.quantidade), ev.opcao ?? 'reduzir-prazo', numeroAtual);
        marcar(linha, `Antecipacao de ${ev.quantidade} parcela(s): VP ${v.toFixed(2)}`);
      } else if (ev.tipo === 'quitacao') {
        const v = saldo;
        extras = extras.plus(v);
        saldo = new Decimal(0);
        marcar(linha, `Quitacao antecipada: ${arredondarMoeda(v).toFixed(2)}`);
      } else if (ev.tipo === 'pagamento') {
        if (ev.diasAtraso > 0 && linha && mora) {
          const valorParcela = new Decimal(linha.valorParcela);
          const multa = valorParcela.times(mora.multa);
          const jurosMora = valorParcela
            .times(mora.jurosMensal)
            .times(new Decimal(ev.diasAtraso).div(30));
          const moraTotal = arredondarMoeda(multa.plus(jurosMora));
          encargos = encargos.plus(moraTotal);
          linha.encargos = moraTotal.toFixed(2);
          linha.valorParcela = arredondarMoeda(valorParcela.plus(moraTotal)).toFixed(2);
          marcar(linha, `Pagamento com ${ev.diasAtraso} dia(s) de atraso: mora ${moraTotal.toFixed(2)}`);
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
    if (saldo.lessThanOrEqualTo(QUASE_ZERO)) {
      break;
    }
  }

  const totais = somarTotais(parcelas);
  const totalAmortizacao = new Decimal(totais.totalAmortizacao).plus(extras);
  const totalJuros = new Decimal(totais.totalJuros);
  const totalPago = new Decimal(totais.totalParcelas).plus(extras);

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
