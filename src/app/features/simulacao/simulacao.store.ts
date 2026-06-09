import { computed, Injectable, signal } from '@angular/core';
import { Decimal } from '../../core/engine/decimal.config';
import {
  ParametrosSimulacao,
  SistemaAmortizacao,
  TipoTaxa,
  UnidadeTaxa,
} from '../../core/engine/models';
import { gerarCronogramaPrice } from '../../core/engine/price';
import { gerarCronogramaSac } from '../../core/engine/sac';
import { somarTotais, TotaisCronograma } from '../../core/engine/totais';
import { taxaEfetivaMensal } from '../../core/engine/rates';
import { CampoAlvo, resolverCampoAlvo } from '../../core/engine/solver';
import { calcularCet, FluxoCaixa } from '../../core/engine/cet';
import {
  EventoCalc,
  LinhaCronograma,
  ParametrosMora,
  projetarComEventos,
  ResumoProjecao,
} from '../../core/engine/eventos';

/** Mora default (espelha regulatory-config.jsonc; idealmente vem da config). */
const MORA_DEFAULT: ParametrosMora = {
  jurosMensal: new Decimal('0.01'),
  multa: new Decimal('0.02'),
};

export interface ResultadoSimulacao {
  parametros: ParametrosSimulacao;
  parcelaCalculada: string;
  parcelas: LinhaCronograma[];
  totais: TotaisCronograma;
  cetMensal: string;
  cetAnual: string;
  /** Presente quando ha eventos pos-simulacao aplicados. */
  resumoEventos?: ResumoProjecao;
}

export type EstadoResultado =
  | { tipo: 'ok'; dados: ResultadoSimulacao }
  | { tipo: 'erro'; mensagem: string };

/**
 * Store de simulacao baseado em signals. Orquestra o motor de calculo e
 * recalcula de forma reativa a cada alteracao de parametro.
 */
@Injectable({ providedIn: 'root' })
export class SimulacaoStore {
  // --- Entradas (signals) ---
  readonly sistema = signal<SistemaAmortizacao>('price');
  readonly campoAlvo = signal<CampoAlvo>('parcela');
  readonly valorBruto = signal('10000');
  readonly taxa = signal('0.02');
  readonly tipoTaxa = signal<TipoTaxa>('efetiva');
  readonly unidadeTaxa = signal<UnidadeTaxa>('mensal');
  readonly prazo = signal(12);
  readonly parcela = signal('500');
  readonly dataBase = signal('2026-01-01');

  // --- Eventos pos-simulacao (lista ordenada; cronograma = projecao dela) ---
  readonly eventos = signal<EventoCalc[]>([]);

  adicionarEvento(evento: EventoCalc): void {
    this.eventos.update((lista) => [...lista, evento].sort((a, b) => a.apos - b.apos));
  }

  removerEvento(indice: number): void {
    this.eventos.update((lista) => lista.filter((_, i) => i !== indice));
  }

  limparEventos(): void {
    this.eventos.set([]);
  }

  /** Campos que ficam travados (somente leitura) = todos menos o campo-alvo. */
  readonly travado = (campo: CampoAlvo): boolean =>
    this.sistema() === 'price' && this.campoAlvo() === campo;

  // --- Resultado reativo ---
  readonly resultado = computed<EstadoResultado>(() => {
    try {
      return { tipo: 'ok', dados: this.calcular() };
    } catch (e) {
      return { tipo: 'erro', mensagem: e instanceof Error ? e.message : 'Erro de calculo' };
    }
  });

  /** Comparativo Price vs SAC para os mesmos {valorBruto, taxa, prazo}. */
  readonly comparativo = computed(() => {
    try {
      const principal = new Decimal(this.valorBruto());
      const i = taxaEfetivaMensal(new Decimal(this.taxa()), this.tipoTaxa(), this.unidadeTaxa());
      const n = this.prazo();
      if (!(n >= 1) || principal.lessThanOrEqualTo(0)) {
        return null;
      }
      const entrada = { principal, taxaPeriodo: i, prazo: n, dataBase: this.dataBase() };
      const price = gerarCronogramaPrice(entrada);
      const sac = gerarCronogramaSac(entrada);
      return {
        price: {
          totais: somarTotais(price),
          primeiraParcela: price[0].valorParcela,
          ultimaParcela: price[n - 1].valorParcela,
        },
        sac: {
          totais: somarTotais(sac),
          primeiraParcela: sac[0].valorParcela,
          ultimaParcela: sac[n - 1].valorParcela,
        },
      };
    } catch {
      return null;
    }
  });

  private calcular(): ResultadoSimulacao {
    const params: ParametrosSimulacao = {
      valorBruto: this.valorBruto(),
      valorLiquido: this.valorBruto(),
      taxa: this.taxa(),
      tipoTaxa: this.tipoTaxa(),
      unidadeTaxa: this.unidadeTaxa(),
      prazo: this.prazo(),
    };
    const dataBase = this.dataBase();

    let resolvidos = params;
    let parcelaCalculada = this.parcela();

    if (this.sistema() === 'price') {
      const alvo = this.campoAlvo();
      const saida = resolverCampoAlvo({
        sistema: 'price',
        parametros: params,
        parcela: alvo === 'parcela' ? undefined : this.parcela(),
        campoAlvo: alvo,
      });
      resolvidos = saida.parametros;
      parcelaCalculada = saida.parcela;
    }

    const principal = new Decimal(resolvidos.valorBruto);
    const i = taxaEfetivaMensal(
      new Decimal(resolvidos.taxa),
      resolvidos.tipoTaxa,
      resolvidos.unidadeTaxa,
    );
    const n = resolvidos.prazo;
    if (!(n >= 1)) {
      throw new Error('Prazo deve ser >= 1.');
    }
    if (principal.lessThanOrEqualTo(0)) {
      throw new Error('Valor bruto deve ser > 0.');
    }

    const entrada = { principal, taxaPeriodo: i, prazo: n, dataBase };
    const eventos = this.eventos();

    // Com eventos: reprojecao deterministica (CET omitido por incluir extras).
    if (eventos.length > 0) {
      const proj = projetarComEventos({
        principal,
        taxaPeriodo: i,
        prazo: n,
        sistema: this.sistema(),
        eventos,
        dataBase,
        mora: MORA_DEFAULT,
      });
      const totaisEv: TotaisCronograma = {
        totalJuros: proj.resumo.totalJuros,
        totalAmortizacao: proj.resumo.totalAmortizacao,
        totalEncargos: proj.resumo.totalEncargos,
        totalParcelas: proj.resumo.totalPago,
      };
      return {
        parametros: resolvidos,
        parcelaCalculada: this.sistema() === 'price' ? parcelaCalculada : proj.parcelas[0].valorParcela,
        parcelas: proj.parcelas,
        totais: totaisEv,
        cetMensal: proj.resumo.cetMensal,
        cetAnual: proj.resumo.cetAnual,
        resumoEventos: proj.resumo,
      };
    }

    const parcelas =
      this.sistema() === 'price' ? gerarCronogramaPrice(entrada) : gerarCronogramaSac(entrada);

    const totais = somarTotais(parcelas);

    // CET a partir do fluxo (liberado = principal; sem encargos nesta fase).
    const fluxos: FluxoCaixa[] = parcelas.map((p) => ({
      periodo: new Decimal(p.numero),
      valor: new Decimal(p.valorParcela),
    }));
    const cet = calcularCet(principal, fluxos);

    if (this.sistema() !== 'price') {
      // SAC: parcela varia; mostra a primeira parcela como referencia.
      parcelaCalculada = parcelas[0]?.valorParcela ?? '0.00';
    }

    return {
      parametros: resolvidos,
      parcelaCalculada,
      parcelas,
      totais,
      cetMensal: cet.mensal.toDecimalPlaces(6).toString(),
      cetAnual: cet.anual.toDecimalPlaces(6).toString(),
    };
  }
}
