/**
 * Modelos de dominio do simulador de emprestimo.
 * Tipos puros, SEM dependencias de Angular (ver SPEC.md secao 5).
 *
 * Convencao: valores monetarios e taxas sao serializados como `string`
 * (Decimal serializado) para preservar precisao. A conversao para Decimal
 * acontece dentro do motor de calculo.
 */

export type SistemaAmortizacao = 'price' | 'sac' | 'sacre' | 'desconto';
export type Publico = 'PF' | 'PJ';
export type Periodicidade = 'mensal' | 'quinzenal' | 'anual';
export type ConvencaoDias = '30/360' | 'ACT/365' | 'ACT/252';
export type ModoArredondamento = 'half-even' | 'half-up';
export type TipoTaxa = 'efetiva' | 'nominal';
export type UnidadeTaxa = 'mensal' | 'anual';

export type TipoEncargo =
  | 'fixo'
  | 'percentual-principal'
  | 'percentual-ap'
  | 'por-periodo'
  | 'unico';

export interface Encargo {
  nome: string;
  tipo: TipoEncargo;
  /** Valor ou aliquota (string Decimal). */
  valor: string;
  /** true = deduzido do liquido na liberacao; false = financiado no bruto. */
  deduzidoDoLiquido: boolean;
  /** Se entra na base do CET. */
  incideNoCet: boolean;
}

export type TipoEvento = 'amortizacao' | 'pagamento' | 'quitacao' | 'antecipacao';
export type OpcaoAmortizacao = 'reduzir-prazo' | 'reduzir-parcela';

export interface Evento {
  id: string;
  tipo: TipoEvento;
  /** Data ISO (YYYY-MM-DD). */
  data: string;
  valor?: string;
  opcao?: OpcaoAmortizacao;
  /** Numeros das parcelas alvo (antecipacao). */
  parcelasAlvo?: number[];
  regrasAplicadas?: string;
}

export interface Parcela {
  numero: number;
  dataVencimento: string;
  saldoInicial: string;
  juros: string;
  amortizacao: string;
  encargos: string;
  valorParcela: string;
  saldoFinal: string;
}

export interface RegrasCalculo {
  arredondamento: ModoArredondamento;
  convencaoDias: ConvencaoDias;
  /** Capitalizacao para periodo irregular/carencia (ver CALC_REF secao 6). */
  capitalizacaoPeriodoIrregular: 'composta' | 'linear';
}

export interface ParametrosSimulacao {
  valorBruto: string;
  valorLiquido: string;
  taxa: string;
  tipoTaxa: TipoTaxa;
  unidadeTaxa: UnidadeTaxa;
  prazo: number;
}

export interface ResultadosSimulacao {
  parcelas: Parcela[];
  totalJuros: string;
  totalAmortizacao: string;
  totalEncargos: string;
  totalPago: string;
  totalIof: string;
  cetMensal: string;
  cetAnual: string;
}

export interface Simulacao {
  id: string;
  /** Data ISO da simulacao (data-base). */
  dataBase: string;
  /** Identificador do produto/preset (ver COMPLIANCE_NOTES.md secao 2). */
  produto: string;
  publico: Publico;
  sistema: SistemaAmortizacao;
  periodicidade: Periodicidade;
  parametros: ParametrosSimulacao;
  encargos: Encargo[];
  regras: RegrasCalculo;
  eventos: Evento[];
  resultados?: ResultadosSimulacao;

  // Rastreabilidade / auditoria (ver ARCHITECTURE.md secao 5).
  engineVersion: string;
  regConfigVersion: string;
  /** Hash SHA-256 do payload canonico. */
  hash?: string;
}
