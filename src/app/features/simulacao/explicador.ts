import { Decimal, arredondarMoeda } from '../../core/engine/decimal.config';
import { SistemaAmortizacao } from '../../core/engine/models';
import type { LinhaCronograma } from '../../core/engine/eventos';
import { taxaEfetivaMensal } from '../../core/engine/rates';
import { calcularParcelaPrice } from '../../core/engine/price';
import { calcularPrimeiraParcelaSac } from '../../core/engine/sac';
import {
  calcularValorPresentePrice,
  calcularValorPresenteSac,
  calcularPrazoPrice,
  calcularPrazoSac,
} from '../../core/engine/solver';
import {
  disp,
  montarTrace,
  passoCalculo,
  passoNota,
  PassoCalculo,
  TraceCalculo,
} from '../../core/engine/trace';
import { ContextoLinha, tracarLinhaCronograma } from '../../core/engine/cronograma-trace';

/** Referência a uma norma brasileira (lei, decreto ou normativo BACEN/CMN). */
export interface ReferenciaNormativa {
  rotulo: string;
  descricao: string;
  url: string;
}

/** Termo de glossário expansível (didático). */
export interface ItemGlossario {
  termo: string;
  definicao: string;
}

/** Link cruzado para outra explicação relacionada. */
export interface LinkRelacionado {
  topico: string;
  rotulo: string;
}

export interface Explicacao {
  titulo: string;
  formula: string;
  /**
   * Fórmula em MathML (renderização nativa do navegador). As variáveis levam
   * classes fx-v0..fx-v5 com as MESMAS cores da tabela de legenda (por índice).
   */
  formulaMathML: string;
  descricao: string;
  legenda: { simbolo: string; nome: string; valor: string }[];
  passos: string[];
  regras: string[];
  /** Sequência de teclas para reproduzir o cálculo na calculadora HP12C. */
  hp12c: string[];
  /** Fórmulas equivalentes no Excel (nomes de função em PT-BR). */
  excel: string[];
  /** Base legal e normativa aplicável ao cálculo. */
  normas: ReferenciaNormativa[];
  /**
   * Traço de cálculo emitido pelo MOTOR (fonte única). Quando presente, a UI o
   * renderiza no lugar de `passos` (que vira um espelho textual dele).
   */
  trace?: TraceCalculo;
  /** Glossário dos termos-chave do tópico (preenchido pelo wrapper). */
  glossario?: ItemGlossario[];
  /** Links para explicações relacionadas (preenchido pelo wrapper). */
  relacionados?: LinkRelacionado[];
  /**
   * Dados para o gráfico de composição das parcelas (juros × amortização por
   * mês). Presente só onde faz sentido (tópico "parcela"). Formato estrutural
   * compatível com BarraComposicao do componente de gráfico.
   */
  graficoComposicao?: { numero: number; juros: number; amortizacao: number }[];
}

// ---------------------------------------------------------------------------
// Normas brasileiras citadas nas explicações (fonte oficial: Planalto / BACEN)
// ---------------------------------------------------------------------------

const NORMA_CET: ReferenciaNormativa = {
  rotulo: 'Resolução CMN nº 4.881/2020',
  descricao:
    'Define o Custo Efetivo Total (CET): taxa que iguala o valor liberado ao fluxo de pagamentos, com prazos contados em dias corridos divididos por 365.',
  url: 'https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20CMN&numero=4881',
};

const NORMA_IOF: ReferenciaNormativa = {
  rotulo: 'Decreto nº 6.306/2007, art. 7º',
  descricao:
    'Regulamenta o IOF sobre operações de crédito: alíquota diária por público (PF/PJ), alíquota adicional fixa e teto de 365 dias.',
  url: 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm',
};

const NORMA_IOF_ISENCAO: ReferenciaNormativa = {
  rotulo: 'Decreto nº 6.306/2007, arts. 8º e 9º',
  descricao:
    'Lista as hipóteses de alíquota zero e isenção do IOF, incluindo o crédito habitacional (SFH).',
  url: 'https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm',
};

const NORMA_CDC_TRANSPARENCIA: ReferenciaNormativa = {
  rotulo: 'Lei nº 8.078/1990 (CDC), art. 52',
  descricao:
    'Obriga o fornecedor de crédito a informar previamente taxa de juros, acréscimos, número e valor das prestações e o total a pagar.',
  url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm',
};

const NORMA_CDC_MULTA: ReferenciaNormativa = {
  rotulo: 'Lei nº 8.078/1990 (CDC), art. 52, § 1º',
  descricao:
    'Limita a multa de mora a 2% do valor da prestação em dívidas de consumo.',
  url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm',
};

const NORMA_CDC_LIQUIDACAO: ReferenciaNormativa = {
  rotulo: 'Lei nº 8.078/1990 (CDC), art. 52, § 2º',
  descricao:
    'Garante ao consumidor o direito de liquidar antecipadamente o débito, total ou parcialmente, com redução proporcional dos juros.',
  url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm',
};

const NORMA_RES_3516: ReferenciaNormativa = {
  rotulo: 'Resolução CMN nº 3.516/2007',
  descricao:
    'Veda a cobrança de tarifa pela liquidação antecipada e define o desconto pelo valor presente nas amortizações antecipadas.',
  url: 'https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o&numero=3516',
};

const NORMA_CC_MORA: ReferenciaNormativa = {
  rotulo: 'Lei nº 10.406/2002 (Código Civil), arts. 406 e 407',
  descricao:
    'Disciplina os juros de mora devidos pelo atraso no pagamento de obrigações em dinheiro.',
  url: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm',
};

const NORMA_LEI_4595: ReferenciaNormativa = {
  rotulo: 'Lei nº 4.595/1964',
  descricao:
    'Estrutura o Sistema Financeiro Nacional e atribui ao CMN/BACEN a competência para disciplinar o crédito e as taxas praticadas pelas instituições financeiras.',
  url: 'https://www.planalto.gov.br/ccivil_03/leis/l4595.htm',
};

const NOTA_EXCEL_REGIONAL =
  'No Excel em português, o separador de argumentos é ponto e vírgula (;) e o separador decimal é vírgula. Em inglês, use PMT/PV/RATE/NPER/IRR/XIRR com vírgula como separador.';

const NOTA_HP12C_PREPARO =
  'Antes de começar: pressione f CLX para limpar os registradores, g END para pagamentos postecipados (fim do período) e f 2 para exibir 2 casas decimais.';

/** Formata número como moeda brasileira (BRL) */
function fmtBRL(v: string | number | Decimal): string {
  const n = typeof v === 'number' ? v : Number(v.toString());
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Formata número como porcentagem */
function fmtPct(v: string | number | Decimal, dec = 2): string {
  const n = typeof v === 'number' ? v : Number(v.toString());
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
}

/** Número em formato PT-BR (vírgula decimal) para uso nas fórmulas de Excel. */
function fmtNum(v: Decimal | number, dec = 2): string {
  const n = typeof v === 'number' ? v : Number(v.toString());
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false });
}

/** Espelha o traço do motor como lista de passos textuais (backward-compat). */
function passosDeTrace(trace: TraceCalculo): string[] {
  return trace.passos.map((p, k) => {
    if (p.formula == null || p.resultado == null) return `${k + 1}. ${p.descricao}`;
    return `${k + 1}. ${p.descricao}: ${p.substituicao} = ${disp(new Decimal(p.resultado), p.casas)}`;
  });
}

/** Passo de cálculo cujo resultado já é um Decimal pronto (atalho local). */
function passoNum(
  id: string,
  descricao: string,
  formula: string,
  substituicao: string,
  resultado: Decimal,
  casas = 2,
): PassoCalculo {
  return passoCalculo(id, descricao, formula, substituicao, resultado, casas);
}

// ---------------------------------------------------------------------------
// Glossário: banco de termos reaproveitado entre tópicos.
// ---------------------------------------------------------------------------

const G = {
  vp: {
    termo: 'Valor Presente (VP)',
    definicao:
      'Quanto vale HOJE um pagamento futuro. Como o dinheiro rende juros, R$ 100 daqui a um ano valem menos que R$ 100 hoje. "Trazer a valor presente" é dividir o valor futuro por (1 + i) elevado ao número de períodos.',
  },
  tir: {
    termo: 'TIR — Taxa Interna de Retorno',
    definicao:
      'A taxa que faz o valor presente de todas as entradas e saídas de um fluxo de caixa se anular (somar zero). No crédito, é a taxa que iguala o que você recebeu ao que vai pagar — é assim que o CET é calculado.',
  },
  jurosCompostos: {
    termo: 'Juros compostos',
    definicao:
      'Juros que incidem sobre o saldo devedor atualizado (principal + juros já acumulados), não apenas sobre o valor original. É o regime usado em financiamentos no Brasil; por isso a fórmula da parcela tem o expoente (1 + i)^n.',
  },
  amortizacao: {
    termo: 'Amortização',
    definicao:
      'A parte da parcela que efetivamente abate o saldo devedor (o principal). O restante da parcela é juros. A soma de todas as amortizações é igual ao valor financiado.',
  },
  saldoDevedor: {
    termo: 'Saldo devedor',
    definicao:
      'O quanto ainda falta pagar do principal em determinado momento. Os juros de cada mês são calculados sobre ele, então quanto mais rápido ele cai, menos juros se paga no total.',
  },
  cet: {
    termo: 'CET — Custo Efetivo Total',
    definicao:
      'A taxa que resume TODO o custo do crédito (juros + IOF + tarifas), expressa ao mês e ao ano. É o número oficial exigido pelo BACEN para comparar propostas — sempre maior ou igual à taxa de juros nominal.',
  },
  iof: {
    termo: 'IOF',
    definicao:
      'Imposto sobre Operações Financeiras. No crédito tem duas partes: uma diária, proporcional ao prazo de cada parcela (com teto de 365 dias), e uma adicional fixa de 0,38% sobre o valor liberado.',
  },
  proRata: {
    termo: 'Pro-rata',
    definicao:
      'Cálculo proporcional ao tempo decorrido. Ex.: juros de mora "pro-rata dia" cobram a fração da taxa mensal correspondente aos dias de atraso (dias ÷ 30).',
  },
  halfEven: {
    termo: 'Arredondamento bancário (half-even)',
    definicao:
      'Quando o valor cai exatamente no meio (ex.: 2,345), arredonda para o dígito PAR mais próximo. Evita o viés de sempre subir, mantendo somas longas equilibradas.',
  },
  mora: {
    termo: 'Mora',
    definicao:
      'O atraso no pagamento. Gera dois encargos sobre a parcela vencida: a multa (percentual fixo, limitado a 2% pelo CDC) e os juros de mora (proporcionais aos dias de atraso).',
  },
  taxaNominal: {
    termo: 'Taxa nominal',
    definicao:
      'Taxa anunciada para um período, mas com capitalização em período menor — sem considerar os juros sobre juros. Ex.: 12% a.a. nominal com capitalização mensal significa apenas 1% a.m. (12 ÷ 12). É um "rótulo": a taxa que realmente incide é a efetiva.',
  },
  taxaEfetiva: {
    termo: 'Taxa efetiva',
    definicao:
      'Taxa que de fato incide no período, já considerando a capitalização composta (juros sobre juros). 1% a.m. efetiva equivale a (1,01)¹² − 1 = 12,6825% a.a. efetiva — maior que os 12% nominais. É a taxa que importa para o custo real.',
  },
} as const;

const GLOSSARIO_POR_TOPICO: Record<string, ItemGlossario[]> = {
  parcela: [G.jurosCompostos, G.amortizacao, G.saldoDevedor, G.vp, G.halfEven],
  valorBruto: [G.vp, G.jurosCompostos, G.amortizacao],
  taxa: [G.tir, G.jurosCompostos, G.vp],
  tipoTaxa: [G.taxaNominal, G.taxaEfetiva, G.jurosCompostos],
  prazo: [G.jurosCompostos, G.saldoDevedor, G.amortizacao],
  valorLiquido: [G.cet, G.iof],
  iof: [G.iof, G.amortizacao],
  iofDiario: [G.iof, G.amortizacao],
  iofAdicional: [G.iof],
  totalPago: [G.amortizacao, G.saldoDevedor],
  totalJuros: [G.saldoDevedor, G.jurosCompostos],
  cetMensal: [G.cet, G.tir, G.vp],
  cetAnual: [G.cet, G.tir, G.vp],
  prazoFinal: [G.saldoDevedor, G.amortizacao],
  economiaJuros: [G.saldoDevedor, G.jurosCompostos],
  amortizacoesExtras: [G.vp, G.amortizacao],
  moraEncargos: [G.mora, G.proRata],
  totalPagoPos: [G.amortizacao, G.saldoDevedor],
  cetMensalPos: [G.cet, G.tir],
};

const RELACIONADOS_POR_TOPICO: Record<string, LinkRelacionado[]> = {
  parcela: [
    { topico: 'totalJuros', rotulo: 'Total de juros' },
    { topico: 'cetMensal', rotulo: 'CET mensal' },
  ],
  valorBruto: [
    { topico: 'parcela', rotulo: 'Parcela (PMT)' },
    { topico: 'valorLiquido', rotulo: 'Valor líquido' },
  ],
  taxa: [
    { topico: 'parcela', rotulo: 'Parcela (PMT)' },
    { topico: 'cetMensal', rotulo: 'CET mensal' },
  ],
  tipoTaxa: [
    { topico: 'taxa', rotulo: 'Taxa de juros (i)' },
    { topico: 'cetMensal', rotulo: 'CET mensal' },
  ],
  prazo: [{ topico: 'parcela', rotulo: 'Parcela (PMT)' }],
  valorLiquido: [
    { topico: 'iof', rotulo: 'IOF total' },
    { topico: 'cetMensal', rotulo: 'CET mensal' },
  ],
  iof: [
    { topico: 'iofDiario', rotulo: 'IOF diário' },
    { topico: 'iofAdicional', rotulo: 'IOF adicional' },
    { topico: 'valorLiquido', rotulo: 'Valor líquido' },
  ],
  iofDiario: [
    { topico: 'iof', rotulo: 'IOF total' },
    { topico: 'iofAdicional', rotulo: 'IOF adicional' },
  ],
  iofAdicional: [
    { topico: 'iof', rotulo: 'IOF total' },
    { topico: 'iofDiario', rotulo: 'IOF diário' },
  ],
  totalPago: [
    { topico: 'totalJuros', rotulo: 'Total de juros' },
    { topico: 'parcela', rotulo: 'Parcela (PMT)' },
  ],
  totalJuros: [
    { topico: 'totalPago', rotulo: 'Total pago' },
    { topico: 'parcela', rotulo: 'Parcela (PMT)' },
  ],
  cetMensal: [
    { topico: 'valorLiquido', rotulo: 'Valor líquido' },
    { topico: 'cetAnual', rotulo: 'CET anual' },
  ],
  cetAnual: [
    { topico: 'cetMensal', rotulo: 'CET mensal' },
    { topico: 'valorLiquido', rotulo: 'Valor líquido' },
  ],
  prazoFinal: [{ topico: 'parcela', rotulo: 'Parcela (PMT)' }],
  economiaJuros: [{ topico: 'totalJuros', rotulo: 'Total de juros' }],
  amortizacoesExtras: [{ topico: 'cetMensal', rotulo: 'CET mensal' }],
  moraEncargos: [{ topico: 'totalPago', rotulo: 'Total pago' }],
  totalPagoPos: [{ topico: 'totalPago', rotulo: 'Total pago (base)' }],
  cetMensalPos: [{ topico: 'cetMensal', rotulo: 'CET mensal (base)' }],
};

/**
 * Retorna a explicação detalhada de um campo, com fórmula, passos, instruções
 * de HP12C/Excel, base legal e — pelo wrapper — glossário e links cruzados.
 */
export function obterExplicacaoMatematica(
  topico: string,
  dados: any,
  sistema: SistemaAmortizacao,
  arredondamento: 'half-even' | 'half-up'
): Explicacao | null {
  // O motor pode lançar para entradas inviáveis (ex.: parcela < juros → prazo
  // infinito). Nesse caso não há cálculo a explicar: devolvemos null.
  let exp: Explicacao | null;
  try {
    exp = construirExplicacao(topico, dados, sistema, arredondamento);
  } catch {
    return null;
  }
  if (!exp) return null;
  exp.glossario = GLOSSARIO_POR_TOPICO[topico] ?? [];
  exp.relacionados = RELACIONADOS_POR_TOPICO[topico] ?? [];
  return exp;
}

/**
 * Explicação de UMA linha do cronograma base (acessível ao clicar na parcela).
 * O traço vem do MOTOR (tracarLinhaCronograma) — fonte única; aqui só montamos
 * a apresentação (legenda, glossário, normas) ao redor dele.
 */
export function explicacaoDaParcela(ctx: ContextoLinha): Explicacao {
  const trace = tracarLinhaCronograma(ctx);
  const passo = (id: string) => new Decimal(trace.passos.find((p) => p.id === id)!.resultado ?? '0');

  return {
    titulo: trace.titulo,
    formula: 'Parcela = Juros + Amortização   ·   Juros = Saldo × i',
    formulaMathML:
      '<math display="block"><mrow>' +
      '<mi class="fx-v0">Parcela</mi><mo>=</mo><mi class="fx-v1">J</mi><mo>+</mo><mi class="fx-v2">A</mi>' +
      '<mspace width="1.2em"></mspace><mtext>com</mtext><mspace width="1.2em"></mspace>' +
      '<mi class="fx-v1">J</mi><mo>=</mo><mi class="fx-v3">Saldo</mi><mo>·</mo><mi class="fx-v4">i</mi>' +
      '</mrow></math>',
    descricao:
      'Cada parcela do cronograma é composta de duas partes: os JUROS do período (a taxa aplicada sobre o saldo devedor no início do mês) e a AMORTIZAÇÃO (a fatia que efetivamente abate o saldo). O saldo final é o saldo inicial menos a amortização — e vira o saldo inicial da próxima parcela.',
    legenda: [
      { simbolo: 'Parcela', nome: 'Valor pago neste mês', valor: fmtBRL(passo('parcela')) },
      { simbolo: 'J', nome: 'Juros do período (sobre o saldo inicial)', valor: fmtBRL(passo('juros')) },
      { simbolo: 'A', nome: 'Amortização (abate o principal)', valor: fmtBRL(passo('amort')) },
      { simbolo: 'Saldo', nome: 'Saldo devedor no início do período', valor: fmtBRL(ctx.saldoInicial) },
      { simbolo: 'i', nome: 'Taxa efetiva do período (mensal)', valor: fmtPct(ctx.taxaPeriodo.times(100), 4) },
      { simbolo: 'Saldo final', nome: 'Saldo devedor ao fim do período', valor: fmtBRL(passo('saldoFinal')) },
    ],
    passos: passosDeTrace(trace),
    trace,
    regras: [
      'Os juros incidem sempre sobre o saldo devedor do INÍCIO do período, nunca sobre o valor original do empréstimo.',
      'A última parcela amortiza todo o saldo restante, absorvendo o resíduo de centavos para zerar a dívida.',
    ],
    hp12c: [
      `${disp(ctx.saldoInicial, 2)} ENTER ${disp(ctx.taxaPeriodo.times(100), 4)} %   → juros do mês = ${disp(passo('juros'), 2)}`,
      `Amortização = parcela − juros; saldo final = saldo inicial − amortização.`,
    ],
    excel: [
      `Juros: =saldo_inicial*${disp(ctx.taxaPeriodo.times(100), 4)}%   → ${disp(passo('juros'), 2)}`,
      `Amortização: =parcela-juros   ·   Saldo final: =saldo_inicial-amortização`,
    ],
    normas: [NORMA_CDC_TRANSPARENCIA],
    glossario: [G.jurosCompostos, G.amortizacao, G.saldoDevedor],
    relacionados: [
      { topico: 'parcela', rotulo: 'Fórmula da parcela' },
      { topico: 'totalJuros', rotulo: 'Total de juros' },
    ],
  };
}

/**
 * Explicação de UMA linha do cronograma APÓS EVENTOS (clicável na tabela de
 * eventos). Mostra a composição da parcela por identidade (sempre exata) e, em
 * seguida, o cálculo de cada evento aplicado, com os números reais que o motor
 * anexou à linha (multa, juros de mora, payoff de quitação, valor amortizado…).
 */
export function explicacaoDeLinhaEvento(linha: LinhaCronograma, taxaPeriodo: Decimal): Explicacao {
  const saldoIni = new Decimal(linha.saldoInicial);
  const saldoFim = new Decimal(linha.saldoFinal);
  const juros = new Decimal(linha.juros);
  const amort = new Decimal(linha.amortizacao);
  const encargos = new Decimal(linha.encargos ?? '0');
  const parcela = new Decimal(linha.valorParcela);
  const i = taxaPeriodo;
  const proRata = !arredondarMoeda(saldoIni.times(i)).equals(juros);
  const temEvento = (linha.tracosEvento?.length ?? 0) > 0;

  const composicao: PassoCalculo[] = [
    proRata
      ? passoNota(
          'juros',
          `Juros do período: ${fmtBRL(juros)}. Houve pré-pagamento no meio do mês, então parte dos juros incide sobre o saldo anterior (juros pro-rata).`,
        )
      : passoCalculo('juros', 'Juros do mês sobre o saldo devedor inicial', 'J = Saldo × i', `${disp(saldoIni, 2)} × ${disp(i)}`, juros, 2),
    passoCalculo('amort', 'Amortização: o quanto esta parcela reduz do saldo devedor', 'A = Saldo inicial − Saldo final', `${disp(saldoIni, 2)} − ${disp(saldoFim, 2)}`, amort, 2),
    encargos.greaterThan(0)
      ? passoCalculo('parcela', 'Valor pago no mês: juros + amortização + encargos de atraso', 'Parcela = J + A + encargos', `${disp(juros, 2)} + ${disp(amort, 2)} + ${disp(encargos, 2)}`, parcela, 2)
      : passoCalculo('parcela', 'Valor pago no mês: juros + amortização', 'Parcela = J + A', `${disp(juros, 2)} + ${disp(amort, 2)}`, parcela, 2),
    passoCalculo('saldoFinal', 'Saldo devedor ao fim do período', 'Saldo final = Saldo inicial − A', `${disp(saldoIni, 2)} − ${disp(amort, 2)}`, saldoFim, 2),
  ];

  const passosEvento: PassoCalculo[] = [];
  for (const tr of linha.tracosEvento ?? []) {
    passosEvento.push(passoNota(`titulo-${tr.id}`, `▸ ${tr.titulo}`));
    passosEvento.push(...tr.passos);
  }

  const trace = montarTrace(
    'linha-evento',
    `Parcela ${linha.numero}${temEvento ? ' — com evento' : ''}`,
    'Parcela = Juros + Amortização',
    [...composicao, ...passosEvento],
  );

  const legenda = [
    { simbolo: 'Parcela', nome: 'Valor pago neste mês', valor: fmtBRL(parcela) },
    { simbolo: 'J', nome: 'Juros do período', valor: fmtBRL(juros) },
    { simbolo: 'A', nome: 'Amortização (abate o principal)', valor: fmtBRL(amort) },
    { simbolo: 'Saldo', nome: 'Saldo devedor no início do período', valor: fmtBRL(saldoIni) },
    { simbolo: 'i', nome: 'Taxa efetiva do período (mensal)', valor: fmtPct(i.times(100), 4) },
    { simbolo: 'Saldo final', nome: 'Saldo devedor ao fim do período', valor: fmtBRL(saldoFim) },
  ];
  if (encargos.greaterThan(0)) {
    legenda.push({ simbolo: 'Encargos', nome: 'Multa + juros de mora por atraso', valor: fmtBRL(encargos) });
  }

  return {
    titulo: trace.titulo,
    formula: 'Parcela = Juros + Amortização   ·   Juros = Saldo × i',
    formulaMathML:
      '<math display="block"><mrow>' +
      '<mi class="fx-v0">Parcela</mi><mo>=</mo><mi class="fx-v1">J</mi><mo>+</mo><mi class="fx-v2">A</mi>' +
      '<mspace width="1.2em"></mspace><mtext>com</mtext><mspace width="1.2em"></mspace>' +
      '<mi class="fx-v1">J</mi><mo>=</mo><mi class="fx-v3">Saldo</mi><mo>·</mo><mi class="fx-v4">i</mi>' +
      '</mrow></math>',
    descricao: temEvento
      ? 'Esta linha teve um EVENTO aplicado. Abaixo vem primeiro a composição normal da parcela (juros + amortização) e, em seguida, o cálculo do evento com os valores reais usados.'
      : 'Composição da parcela: os juros do período sobre o saldo devedor, mais a amortização que abate o principal. O saldo final é o saldo inicial menos a amortização.',
    legenda,
    passos: passosDeTrace(trace),
    trace,
    regras: temEvento
      ? [
          'O cronograma é recalculado de forma determinística: cancelar um evento equivale a reprojetar sem ele.',
          'Pré-pagamentos (amortização/quitação/antecipação) reduzem o saldo devedor e, portanto, os juros futuros.',
        ]
      : [
          'Os juros incidem sempre sobre o saldo devedor do INÍCIO do período.',
          'A amortização é a parte da parcela que efetivamente reduz o saldo devedor.',
        ],
    hp12c: [
      `${disp(saldoIni, 2)} ENTER ${disp(i.times(100), 4)} %   → juros do mês = ${disp(juros, 2)}`,
      'Amortização = saldo inicial − saldo final; parcela = juros + amortização (+ encargos).',
    ],
    excel: [
      `Juros: =saldo_inicial*${disp(i.times(100), 4)}%   → ${disp(juros, 2)}`,
      'Amortização: =saldo_inicial-saldo_final   ·   Parcela: =juros+amortização',
    ],
    normas: temEvento
      ? [NORMA_CDC_LIQUIDACAO, NORMA_CDC_MULTA, NORMA_CDC_TRANSPARENCIA]
      : [NORMA_CDC_TRANSPARENCIA],
    glossario: temEvento
      ? [G.saldoDevedor, G.amortizacao, G.mora, G.proRata, G.vp]
      : [G.jurosCompostos, G.amortizacao, G.saldoDevedor],
    relacionados: [
      { topico: 'prazoFinal', rotulo: 'Prazo final após eventos' },
      { topico: 'economiaJuros', rotulo: 'Economia de juros' },
    ],
  };
}

function construirExplicacao(
  topico: string,
  dados: any,
  sistema: SistemaAmortizacao,
  arredondamento: 'half-even' | 'half-up'
): Explicacao | null {
  if (!dados) return null;

  const regraArredondamento =
    arredondamento === 'half-even'
      ? 'Arredondamento Bancário (Half-Even): em caso de empate exato no meio (ex.: R$ 2,345), arredonda para o dígito PAR mais próximo (2,34). É o padrão contábil/financeiro porque não introduz viés sistemático para cima nem para baixo em somas longas.'
      : 'Arredondamento Comercial (Half-Up): em caso de empate exato no meio (5), arredonda sempre para cima.';

  const resolvidos = dados.parametros || dados.resolvidos;
  const pv = new Decimal(resolvidos?.valorBruto || '0');
  const n = Number(resolvidos?.prazo || '0');

  // Taxa periódica i (mensal)
  const iMensal = taxaEfetivaMensal(
    new Decimal(resolvidos?.taxa || '0'),
    resolvidos?.tipoTaxa || 'efetiva',
    resolvidos?.unidadeTaxa || 'mensal'
  );
  const iPct = iMensal.times(100); // taxa mensal em % (como se digita na HP12C/Excel)
  const taxaExibicao = fmtPct(iPct, 4);

  // Série para o gráfico de composição (juros × amortização por mês), quando o
  // resultado traz o cronograma — usada pelo tópico "parcela".
  const graficoComposicao: { numero: number; juros: number; amortizacao: number }[] | undefined =
    Array.isArray(dados.parcelas) && dados.parcelas.length
      ? dados.parcelas.map((p: any) => ({
          numero: Number(p.numero),
          juros: Number(p.juros),
          amortizacao: Number(p.amortizacao),
        }))
      : undefined;

  switch (topico) {
    case 'parcela': {
      if (sistema === 'price') {
        // Cálculo e passos vêm do MOTOR (fonte única) — sem re-derivação aqui.
        const { valor: pmtCalculado, trace } = calcularParcelaPrice(pv, iMensal, n);
        const pmtFmt = fmtNum(new Decimal(dados.parcelaCalculada || pmtCalculado));

        return {
          titulo: 'Parcela (PMT) — Sistema Price (Tabela Price)',
          graficoComposicao,
          formula: 'PMT = PV × [ i / (1 − (1 + i)^−n) ]',
          formulaMathML:
            '<math display="block"><mrow>' +
            '<mi class="fx-v0">PMT</mi><mo>=</mo><mi class="fx-v1">PV</mi><mo>·</mo>' +
            '<mfrac><mi class="fx-v2">i</mi>' +
            '<mrow><mn>1</mn><mo>−</mo><msup><mrow><mo>(</mo><mn>1</mn><mo>+</mo><mi class="fx-v2">i</mi><mo>)</mo></mrow>' +
            '<mrow><mo>−</mo><mi class="fx-v3">n</mi></mrow></msup></mrow></mfrac>' +
            '</mrow></math>',
          descricao:
            'No sistema Price (também chamado de Sistema Francês de Amortização), todas as parcelas têm o MESMO valor do início ao fim do contrato. Cada parcela é composta de uma parte de juros (calculados sobre o saldo devedor do mês) e uma parte de amortização (que abate o saldo). Como o saldo devedor diminui mês a mês, os juros caem e a amortização cresce — mas a soma das duas partes permanece constante. A fórmula vem da soma de uma progressão geométrica: ela encontra o pagamento fixo cujo valor presente, descontado a juros compostos, é exatamente igual ao valor financiado.',
          legenda: [
            { simbolo: 'PMT', nome: 'Valor da Parcela Periódica (constante)', valor: fmtBRL(dados.parcelaCalculada) },
            { simbolo: 'PV', nome: 'Valor Bruto financiado (Present Value)', valor: fmtBRL(pv) },
            { simbolo: 'i', nome: 'Taxa de juros efetiva do período (mensal, em fração)', valor: taxaExibicao },
            { simbolo: 'n', nome: 'Prazo total em meses', valor: String(n) },
          ],
          passos: passosDeTrace(trace),
          trace,
          regras: [
            regraArredondamento,
            'O resíduo de centavos causado pelo arredondamento do PMT é absorvido inteiramente na ÚLTIMA parcela do cronograma, garantindo que a soma exata das amortizações seja igual ao valor financiado (a última parcela pode diferir alguns centavos das demais).',
            'A taxa informada em outra unidade (anual efetiva ou nominal) é antes convertida para a taxa efetiva mensal equivalente.',
          ],
          hp12c: [
            NOTA_HP12C_PREPARO,
            `${fmtNum(pv)} CHS PV   (valor financiado; CHS troca o sinal — convenção de fluxo de caixa)`,
            `${fmtNum(iPct, 4)} i   (taxa MENSAL em porcentagem)`,
            `${n} n   (número de parcelas)`,
            `PMT   → exibe ${pmtFmt} (valor da parcela)`,
          ],
          excel: [
            `=PGTO(${fmtNum(iPct, 4)}%; ${n}; -${fmtNum(pv)})   → ${pmtFmt}`,
            'Sintaxe: =PGTO(taxa_mensal; nº_parcelas; -valor_financiado). O sinal negativo no valor presente segue a convenção de fluxo de caixa (dinheiro que entra é positivo, que sai é negativo).',
            NOTA_EXCEL_REGIONAL,
          ],
          normas: [NORMA_CDC_TRANSPARENCIA, NORMA_LEI_4595],
        };
      } else {
        // SAC — cálculo e passos vêm do MOTOR (fonte única).
        const { trace } = calcularPrimeiraParcelaSac(pv, iMensal, n);
        const amort = pv.div(n);
        const juros1 = pv.times(iMensal);

        return {
          titulo: 'Primeira Parcela (PMT₁) — Sistema SAC',
          graficoComposicao,
          formula: 'PMT_k = A + J_k    onde  A = PV / n   e   J_k = Saldo_(k−1) × i',
          formulaMathML:
            '<math display="block"><mrow>' +
            '<msub><mi class="fx-v0">PMT</mi><mi>k</mi></msub><mo>=</mo><mi class="fx-v1">A</mi><mo>+</mo><msub><mi class="fx-v2">J</mi><mi>k</mi></msub>' +
            '<mspace width="1.2em"></mspace><mtext>com</mtext><mspace width="1.2em"></mspace>' +
            '<mi class="fx-v1">A</mi><mo>=</mo><mfrac><mi class="fx-v3">PV</mi><mi class="fx-v5">n</mi></mfrac>' +
            '<mspace width="1.2em"></mspace><mtext>e</mtext><mspace width="1.2em"></mspace>' +
            '<msub><mi class="fx-v2">J</mi><mi>k</mi></msub><mo>=</mo>' +
            '<msub><mi>S</mi><mrow><mi>k</mi><mo>−</mo><mn>1</mn></mrow></msub><mo>·</mo><mi class="fx-v4">i</mi>' +
            '</mrow></math>',
          descricao:
            'No Sistema de Amortização Constante (SAC), o que é fixo não é a parcela, e sim a AMORTIZAÇÃO: todo mês o cliente abate exatamente PV/n do principal. Os juros de cada mês incidem sobre o saldo devedor restante — por isso começam altos e caem linearmente, fazendo as parcelas serem DECRESCENTES. Comparado ao Price com a mesma taxa e prazo, o SAC tem primeira parcela maior, última parcela menor e paga MENOS juros no total, porque amortiza o principal mais rápido no início. É o sistema mais comum no crédito imobiliário brasileiro.',
          legenda: [
            { simbolo: 'PMT₁', nome: 'Primeira parcela (a maior do cronograma)', valor: fmtBRL(dados.parcelaCalculada) },
            { simbolo: 'A', nome: 'Amortização constante mensal', valor: fmtBRL(amort) },
            { simbolo: 'J₁', nome: 'Juros da primeira parcela', valor: fmtBRL(juros1) },
            { simbolo: 'PV', nome: 'Valor Bruto financiado', valor: fmtBRL(pv) },
            { simbolo: 'i', nome: 'Taxa de juros mensal', valor: taxaExibicao },
            { simbolo: 'n', nome: 'Prazo total em meses', valor: String(n) },
          ],
          passos: [
            ...passosDeTrace(trace),
            `${trace.passos.length + 1}. Para as parcelas seguintes (k > 1), os juros caem porque o saldo diminui: Saldo_(k−1) = PV − A × (k − 1). A parcela k é A + Saldo_(k−1) × i — redução constante de A × i = ${fmtBRL(amort.times(iMensal))} por mês.`,
          ],
          trace,
          regras: [
            regraArredondamento,
            'O arredondamento da cota de amortização (PV/n) pode deixar resíduo de centavos. O motor corrige a amortização da ÚLTIMA parcela para liquidar exatamente o saldo devedor.',
          ],
          hp12c: [
            'A HP12C não possui função nativa para SAC — o cálculo é aritmético:',
            `${fmtNum(pv)} ENTER ${n} ÷   → amortização constante A = ${fmtNum(amort)}`,
            `${fmtNum(pv)} ENTER ${fmtNum(iPct, 4)} %   → juros do 1º mês J₁ = ${fmtNum(juros1)}`,
            `+   → primeira parcela PMT₁ = ${fmtNum(new Decimal(trace.resultado))}`,
            'Para a parcela k: recalcule o saldo (PV − A×(k−1)), aplique % com a taxa e some A.',
          ],
          excel: [
            `Amortização constante: =${fmtNum(pv)}/${n}   → ${fmtNum(amort)}`,
            `Juros do mês k (saldo na célula anterior): =saldo_anterior*${fmtNum(iPct, 4)}%`,
            'Parcela k: =amortização + juros_k. Monte uma linha por mês: Saldo | Juros | Amortização | Parcela.',
            NOTA_EXCEL_REGIONAL,
          ],
          normas: [NORMA_CDC_TRANSPARENCIA, NORMA_LEI_4595],
        };
      }
    }

    case 'valorBruto': {
      if (sistema === 'price') {
        const pmt = new Decimal(dados.parcelaCalculada);
        const { valor: pvCalculado, trace } = calcularValorPresentePrice(pmt, iMensal, n);

        return {
          titulo: 'Valor Bruto (PV) — Sistema Price',
          formula: 'PV = PMT × [ (1 − (1 + i)^−n) / i ]',
          formulaMathML:
            '<math display="block"><mrow>' +
            '<mi class="fx-v0">PV</mi><mo>=</mo><mi class="fx-v1">PMT</mi><mo>·</mo>' +
            '<mfrac><mrow><mn>1</mn><mo>−</mo><msup><mrow><mo>(</mo><mn>1</mn><mo>+</mo><mi class="fx-v2">i</mi><mo>)</mo></mrow>' +
            '<mrow><mo>−</mo><mi class="fx-v3">n</mi></mrow></msup></mrow><mi class="fx-v2">i</mi></mfrac>' +
            '</mrow></math>',
          descricao:
            'Resolve o problema inverso do financiamento: "se eu consigo pagar uma parcela PMT por mês, quanto posso financiar?". Matematicamente, o valor financiável é o VALOR PRESENTE da série de parcelas — cada parcela futura é descontada pela taxa de juros (uma parcela daqui a 12 meses "vale menos" hoje do que uma daqui a 1 mês), e a soma desses valores descontados é o principal.',
          legenda: [
            { simbolo: 'PV', nome: 'Valor Bruto financiável', valor: fmtBRL(pvCalculado) },
            { simbolo: 'PMT', nome: 'Parcela periódica fixada', valor: fmtBRL(pmt) },
            { simbolo: 'i', nome: 'Taxa de juros mensal', valor: taxaExibicao },
            { simbolo: 'n', nome: 'Prazo em meses', valor: String(n) },
          ],
          passos: passosDeTrace(trace),
          trace,
          regras: [regraArredondamento],
          hp12c: [
            NOTA_HP12C_PREPARO,
            `${fmtNum(pmt)} CHS PMT   (parcela desejada, sinal trocado)`,
            `${fmtNum(iPct, 4)} i   (taxa mensal em %)`,
            `${n} n   (prazo em meses)`,
            `PV   → exibe ${fmtNum(pvCalculado)} (valor financiável)`,
          ],
          excel: [
            `=VP(${fmtNum(iPct, 4)}%; ${n}; -${fmtNum(pmt)})   → ${fmtNum(pvCalculado)}`,
            'Sintaxe: =VP(taxa; nº_parcelas; -parcela). Em inglês: =PV(...).',
            NOTA_EXCEL_REGIONAL,
          ],
          normas: [NORMA_CDC_TRANSPARENCIA, NORMA_LEI_4595],
        };
      } else {
        // SAC
        const pmt1 = new Decimal(dados.parcelaCalculada);
        const { valor: pvCalculado, trace } = calcularValorPresenteSac(pmt1, iMensal, n);

        return {
          titulo: 'Valor Bruto (PV) — Sistema SAC',
          formula: 'PV = PMT₁ / ( 1/n + i )',
          formulaMathML:
            '<math display="block"><mrow>' +
            '<mi class="fx-v0">PV</mi><mo>=</mo>' +
            '<mfrac><msub><mi class="fx-v1">PMT</mi><mn>1</mn></msub>' +
            '<mrow><mfrac><mn>1</mn><mi class="fx-v3">n</mi></mfrac><mo>+</mo><mi class="fx-v2">i</mi></mrow></mfrac>' +
            '</mrow></math>',
          descricao:
            'No SAC, a primeira parcela é a soma da amortização constante (PV/n) com os juros do primeiro mês (PV×i). Colocando PV em evidência: PMT₁ = PV × (1/n + i). Basta inverter a relação para descobrir quanto pode ser financiado a partir da primeira parcela que cabe no orçamento — lembrando que, no SAC, as parcelas seguintes serão sempre MENORES que a primeira.',
          legenda: [
            { simbolo: 'PV', nome: 'Valor Bruto financiável', valor: fmtBRL(pvCalculado) },
            { simbolo: 'PMT₁', nome: 'Primeira parcela fixada (a maior)', valor: fmtBRL(pmt1) },
            { simbolo: 'i', nome: 'Taxa de juros mensal', valor: taxaExibicao },
            { simbolo: 'n', nome: 'Prazo em meses', valor: String(n) },
          ],
          passos: passosDeTrace(trace),
          trace,
          regras: [regraArredondamento],
          hp12c: [
            'Cálculo aritmético (sem registradores financeiros):',
            `${n} 1/x   → 1/n = ${disp(new Decimal(1).div(n))}`,
            `${fmtNum(iPct, 4)} ENTER 100 ÷ +   → soma a taxa em fração`,
            `${fmtNum(pmt1)} x><y ÷   → PV = ${fmtNum(pvCalculado)}`,
          ],
          excel: [
            `=${fmtNum(pmt1)}/(1/${n}+${fmtNum(iPct, 4)}%)   → ${fmtNum(pvCalculado)}`,
            NOTA_EXCEL_REGIONAL,
          ],
          normas: [NORMA_CDC_TRANSPARENCIA, NORMA_LEI_4595],
        };
      }
    }

    case 'taxa': {
      const pmt = new Decimal(dados.parcelaCalculada || '0');

      const trace = montarTrace(
        'taxa-tir',
        'Taxa de Juros (i) — Métodos Numéricos',
        'Encontrar i tal que PV = Σ [ PMT_k / (1 + i)^k ]',
        [
          passoNota('f', 'Definir f(i) = (valor presente das parcelas à taxa i) − PV. A raiz de f é a taxa procurada.'),
          passoNota('newton', "Newton-Raphson: i_(j+1) = i_j − f(i_j) / f'(i_j). Cada iteração usa a inclinação da curva para saltar mais perto da raiz (convergência quadrática)."),
          passoNota('fallback', 'Se a derivada zerar ou a iteração sair do domínio (i ≤ −100%), troca para a bisseção: corta o intervalo ao meio mantendo a metade onde f muda de sinal.'),
          passoNota('tol', 'Convergência declarada quando |f(i)| < 10⁻¹⁰ (tolerância do motor).'),
          passoNum('i', 'Taxa mensal encontrada', 'i', 'raiz de f(i) = 0', iMensal, 6),
        ],
      );

      return {
        titulo: 'Taxa de Juros (i) — Resolução por Métodos Numéricos',
        trace,
        formula: 'Encontrar i tal que:  PV = Σ [ PMT_k / (1 + i)^k ]',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<mi class="fx-v1">PV</mi><mo>=</mo>' +
          '<munderover><mo>∑</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi class="fx-v3">n</mi></munderover>' +
          '<mfrac><msub><mi class="fx-v2">PMT</mi><mi>k</mi></msub>' +
          '<msup><mrow><mo>(</mo><mn>1</mn><mo>+</mo><mi class="fx-v0">i</mi><mo>)</mo></mrow><mi>k</mi></msup></mfrac>' +
          '</mrow></math>',
        descricao:
          'Quando a incógnita é a taxa, NÃO existe fórmula algébrica fechada para n > 4 (é uma equação polinomial de grau n — consequência do teorema de Abel-Ruffini). Toda calculadora financeira e o Excel resolvem por tentativa e erro estruturado: o método de Newton-Raphson parte de um chute inicial e refina a estimativa usando a derivada da função; se ele oscilar ou divergir, o motor troca para a bisseção, que estreita um intervalo onde a raiz certamente está. A taxa encontrada é aquela que faz o valor presente das parcelas bater exatamente com o valor financiado.',
        legenda: [
          { simbolo: 'i', nome: 'Taxa mensal calculada', valor: taxaExibicao },
          { simbolo: 'PV', nome: 'Valor Bruto', valor: fmtBRL(pv) },
          { simbolo: 'PMT_k', nome: 'Parcela do período k', valor: fmtBRL(dados.parcelaCalculada) },
          { simbolo: 'n', nome: 'Prazo', valor: String(n) },
        ],
        passos: passosDeTrace(trace),
        regras: [
          'Tolerância de convergência parametrizada em "cet.toleranciaTir" no regulatory-config.jsonc.',
          'Se a parcela informada for menor que PV/n, não existe taxa ≥ 0 que satisfaça a equação — o sistema rejeita a combinação com mensagem de erro.',
        ],
        hp12c: [
          NOTA_HP12C_PREPARO,
          `${fmtNum(pv)} CHS PV   (valor financiado)`,
          `${fmtNum(pmt)} PMT   (valor da parcela)`,
          `${n} n   (prazo)`,
          `i   → exibe ${fmtNum(iPct, 4)} (taxa mensal em %; a HP12C executa internamente a mesma busca iterativa)`,
        ],
        excel: [
          `=TAXA(${n}; -${fmtNum(pmt)}; ${fmtNum(pv)})   → ${fmtNum(iMensal, 6)} (multiplique por 100 para %)`,
          'Sintaxe: =TAXA(nper; -pgto; vp; [vf]; [tipo]; [estimativa]). Em inglês: =RATE(...).',
          NOTA_EXCEL_REGIONAL,
        ],
        normas: [NORMA_LEI_4595, NORMA_CDC_TRANSPARENCIA],
      };
    }

    case 'tipoTaxa': {
      // Exemplo numérico ancorado na taxa efetiva mensal atual do formulário.
      const im = iMensal; // efetiva mensal (fração)
      const imPct = im.times(100);
      const iNomAnualPct = im.times(12).times(100); // nominal anual (capitalização linear)
      const iEfAnual = im.plus(1).pow(12).minus(1); // efetiva anual (juros compostos)
      const iEfAnualPct = iEfAnual.times(100);
      const difPct = iEfAnualPct.minus(iNomAnualPct);

      const trace = montarTrace(
        'tipo-taxa',
        'Taxa Efetiva × Nominal',
        'i_ef = (1 + i_nom / m)^m − 1',
        [
          passoNota('base', `Ponto de partida: taxa efetiva mensal i_m = ${disp(imPct, 4)}% (${disp(im, 6)} em fração).`),
          passoNum('nominal', 'Taxa NOMINAL anual — multiplica por 12 (capitalização linear, sem juros sobre juros)', 'i_nom = i_m × 12', `${disp(imPct, 4)}% × 12`, iNomAnualPct, 4),
          passoNum('efetiva', 'Taxa EFETIVA anual — capitaliza os 12 meses a juros compostos', 'i_ef = (1 + i_m)^12 − 1', `(1 + ${disp(im, 6)})^12 − 1`, iEfAnualPct, 4),
          passoNum('dif', 'Diferença — o "ganho" embutido da capitalização composta', 'i_ef − i_nom', `${disp(iEfAnualPct, 4)}% − ${disp(iNomAnualPct, 4)}%`, difPct, 4),
        ],
      );

      return {
        titulo: 'Taxa Efetiva × Taxa Nominal',
        trace,
        formula: 'i_efetiva = (1 + i_nominal / m)^m − 1',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<msub><mi class="fx-v0">i</mi><mtext>ef</mtext></msub><mo>=</mo>' +
          '<msup><mrow><mo>(</mo><mn>1</mn><mo>+</mo>' +
          '<mfrac><msub><mi class="fx-v1">i</mi><mtext>nom</mtext></msub><mi class="fx-v2">m</mi></mfrac>' +
          '<mo>)</mo></mrow><mi class="fx-v2">m</mi></msup><mo>−</mo><mn>1</mn>' +
          '</mrow></math>',
        descricao:
          'A taxa NOMINAL é apenas um rótulo anual: ela é dividida igualmente pelos períodos de capitalização, sem considerar os juros sobre juros. Já a taxa EFETIVA é a que realmente incide, pois acumula a capitalização composta. Por isso, para a MESMA taxa mensal, a efetiva anual é sempre MAIOR que a nominal anual. No Brasil, contratos e o BACEN exigem a divulgação da taxa efetiva (e do CET) justamente porque a nominal subestima o custo real. Importante: em base mensal, efetiva e nominal coincidem — a diferença só aparece ao anualizar.',
        legenda: [
          { simbolo: 'i_ef', nome: 'Taxa efetiva anual (juros compostos)', valor: fmtPct(iEfAnualPct, 4) },
          { simbolo: 'i_nom', nome: 'Taxa nominal anual (capitalização linear)', valor: fmtPct(iNomAnualPct, 4) },
          { simbolo: 'm', nome: 'Capitalizações por ano', valor: '12' },
          { simbolo: 'i_m', nome: 'Taxa efetiva mensal (base do exemplo)', valor: fmtPct(imPct, 4) },
        ],
        passos: passosDeTrace(trace),
        regras: [
          'Em base mensal, efetiva = nominal: a conversão composta só altera o valor quando se muda de período (mensal → anual).',
          'Nominal → mensal é divisão simples (÷ m); mensal → anual efetiva é potência ((1 + i)^m − 1). Nunca multiplique a taxa mensal por 12 esperando a efetiva anual.',
          'O CET sempre usa taxas efetivas — comparar propostas pela taxa nominal pode enganar.',
        ],
        hp12c: [
          'A HP12C converte mensal → anual efetiva com a função de potência (yˣ):',
          `${disp(im, 6)} ENTER 1 + 12 yˣ 1 −   → ${disp(iEfAnual, 6)} (efetiva anual em fração; ×100 = ${disp(iEfAnualPct, 4)}%)`,
          `Nominal → mensal (divisão simples): ${disp(iNomAnualPct, 4)} ENTER 12 ÷   → ${disp(imPct, 4)} (taxa mensal em %)`,
        ],
        excel: [
          `Mensal → efetiva anual: =(1+${fmtNum(im, 6)})^12-1   → ${fmtNum(iEfAnual, 6)} (formate como %)`,
          `Nominal anual → efetiva anual: =(1+${fmtNum(iNomAnualPct, 4)}%/12)^12-1`,
          'Efetiva anual → mensal: =(1+i_anual)^(1/12)-1',
          NOTA_EXCEL_REGIONAL,
        ],
        normas: [NORMA_CDC_TRANSPARENCIA, NORMA_LEI_4595],
      };
    }

    case 'prazo': {
      if (sistema === 'price') {
        const pmt = new Decimal(dados.parcelaCalculada);
        const { n: nCalc, trace } = calcularPrazoPrice(pv, pmt, iMensal);
        const nExato = new Decimal(trace.resultado);

        return {
          titulo: 'Prazo (n) — Sistema Price',
          formula: 'n = − ln( 1 − PV × i / PMT ) / ln( 1 + i )',
          formulaMathML:
            '<math display="block"><mrow>' +
            '<mi class="fx-v0">n</mi><mo>=</mo><mo>−</mo>' +
            '<mfrac><mrow><mi>ln</mi><mo>(</mo><mn>1</mn><mo>−</mo>' +
            '<mfrac><mrow><mi class="fx-v1">PV</mi><mo>·</mo><mi class="fx-v2">i</mi></mrow><mi class="fx-v3">PMT</mi></mfrac>' +
            '<mo>)</mo></mrow>' +
            '<mrow><mi>ln</mi><mo>(</mo><mn>1</mn><mo>+</mo><mi class="fx-v2">i</mi><mo>)</mo></mrow></mfrac>' +
            '</mrow></math>',
          descricao:
            'Resolve a equação do Price para o número de períodos: "pagando PMT por mês a esta taxa, em quantos meses quito o financiamento?". O logaritmo aparece porque o prazo está no expoente da fórmula de juros compostos — para "descer" uma incógnita do expoente, aplica-se ln dos dois lados. Atenção à condição de existência: a parcela precisa ser MAIOR que os juros do primeiro mês (PV×i), senão a dívida nunca diminui.',
          legenda: [
            { simbolo: 'n', nome: 'Prazo calculado (meses)', valor: `${nCalc} (exato ${nExato.toFixed(4)})` },
            { simbolo: 'PV', nome: 'Valor Bruto', valor: fmtBRL(pv) },
            { simbolo: 'i', nome: 'Taxa de juros mensal', valor: taxaExibicao },
            { simbolo: 'PMT', nome: 'Parcela fixada', valor: fmtBRL(pmt) },
          ],
          passos: passosDeTrace(trace),
          trace,
          regras: [
            'O prazo é arredondado para um número inteiro de parcelas; a última parcela ajusta o resíduo.',
            'Se PMT ≤ PV × i, a parcela não cobre nem os juros: o saldo cresceria para sempre (prazo infinito). O sistema rejeita essa combinação.',
          ],
          hp12c: [
            NOTA_HP12C_PREPARO,
            `${fmtNum(pv)} CHS PV   (valor financiado)`,
            `${fmtNum(pmt)} PMT   (parcela)`,
            `${fmtNum(iPct, 4)} i   (taxa mensal em %)`,
            `n   → exibe o prazo. ATENÇÃO: a HP12C sempre arredonda n PARA CIMA (ex.: 11,3 vira 12) — pode diferir em 1 do valor exato.`,
          ],
          excel: [
            `=NPER(${fmtNum(iPct, 4)}%; -${fmtNum(pmt)}; ${fmtNum(pv)})   → ${nExato.toFixed(2)} (valor fracionário exato)`,
            'Sintaxe: =NPER(taxa; -pgto; vp). Arredonde com =ARRED(...;0) para obter o prazo em meses inteiros.',
            NOTA_EXCEL_REGIONAL,
          ],
          normas: [NORMA_CDC_TRANSPARENCIA],
        };
      } else {
        // SAC
        const pmt1 = new Decimal(dados.parcelaCalculada);
        const { n: nCalc, trace } = calcularPrazoSac(pv, pmt1, iMensal);
        const amort = pmt1.minus(pv.times(iMensal));

        return {
          titulo: 'Prazo (n) — Sistema SAC',
          formula: 'n = PV / A    onde  A = PMT₁ − PV × i',
          formulaMathML:
            '<math display="block"><mrow>' +
            '<mi class="fx-v0">n</mi><mo>=</mo><mfrac><mi class="fx-v1">PV</mi><mi class="fx-v2">A</mi></mfrac>' +
            '<mspace width="1.2em"></mspace><mtext>com</mtext><mspace width="1.2em"></mspace>' +
            '<mi class="fx-v2">A</mi><mo>=</mo><msub><mi>PMT</mi><mn>1</mn></msub><mo>−</mo>' +
            '<mi class="fx-v1">PV</mi><mo>·</mo><mi>i</mi>' +
            '</mrow></math>',
          descricao:
            'No SAC a conta é direta, sem logaritmos: a primeira parcela é amortização + juros do 1º mês. Deduzindo os juros (PV×i) da primeira parcela, sobra a cota de amortização constante A. Como toda parcela abate exatamente A do principal, o prazo é simplesmente quantas cotas A cabem no valor financiado.',
          legenda: [
            { simbolo: 'n', nome: 'Prazo calculado (meses)', valor: `${nCalc} (exato ${new Decimal(trace.resultado).toFixed(4)})` },
            { simbolo: 'PV', nome: 'Valor Bruto', valor: fmtBRL(pv) },
            { simbolo: 'A', nome: 'Amortização constante deduzida', valor: fmtBRL(amort) },
          ],
          passos: passosDeTrace(trace),
          trace,
          regras: [
            'O prazo é arredondado para um número inteiro contábil de parcelas.',
            'Se PMT₁ ≤ PV × i, a primeira parcela não cobre os juros — não existe prazo válido e o sistema rejeita.',
          ],
          hp12c: [
            'Cálculo aritmético:',
            `${fmtNum(pv)} ENTER ${fmtNum(iPct, 4)} %   → juros do 1º mês = ${fmtNum(pv.times(iMensal))}`,
            `${fmtNum(pmt1)} x><y −   → amortização A = ${fmtNum(amort)}`,
            `${fmtNum(pv)} x><y ÷   → n = ${new Decimal(trace.resultado).toFixed(2)}`,
          ],
          excel: [
            `=${fmtNum(pv)}/(${fmtNum(pmt1)}-${fmtNum(pv)}*${fmtNum(iPct, 4)}%)   → ${new Decimal(trace.resultado).toFixed(2)}`,
            NOTA_EXCEL_REGIONAL,
          ],
          normas: [NORMA_CDC_TRANSPARENCIA],
        };
      }
    }

    case 'valorLiquido': {
      const tarifa = new Decimal(resolvidos?.tarifaAbertura || '0');
      const iof = new Decimal(dados.iof || '0');
      const semTarifa = pv.minus(tarifa);
      const liq = semTarifa.minus(iof);

      const trace = montarTrace('valor-liquido', 'Valor Líquido Liberado', 'Líquido = Bruto − Tarifa − IOF', [
        passoNota('base', `Partir do valor bruto contratado (PV): ${fmtBRL(pv)}.`),
        passoNum('tarifa', 'Subtrair a tarifa de abertura de crédito (TAC)', 'PV − Tarifa', `${disp(pv, 2)} − ${disp(tarifa, 2)}`, semTarifa),
        passoNum('iof', 'Subtrair o IOF retido na liberação', '(PV − Tarifa) − IOF', `${disp(semTarifa, 2)} − ${disp(iof, 2)}`, liq),
      ]);

      return {
        titulo: 'Valor Líquido Liberado',
        trace,
        formula: 'Líquido = Bruto − Tarifa de Abertura − IOF total',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<mtext class="fx-v0">Líquido</mtext><mo>=</mo><mtext class="fx-v1">Bruto</mtext><mo>−</mo>' +
          '<mtext class="fx-v2">Tarifa</mtext><mo>−</mo><msub><mtext class="fx-v3">IOF</mtext><mtext>total</mtext></msub>' +
          '</mrow></math>',
        descricao:
          'O valor que efetivamente cai na conta do cliente é o principal financiado MENOS os custos retidos na fonte: a tarifa de abertura de crédito (TAC, quando cobrada) e o IOF. É uma distinção fundamental: os JUROS incidem sobre o valor BRUTO, mas o cliente só recebe o LÍQUIDO — por isso o CET (custo efetivo) é sempre maior que a taxa de juros contratada. A Resolução CMN 4.881/2020 exige que o CET seja calculado justamente sobre o valor líquido liberado.',
        legenda: [
          { simbolo: 'Líquido', nome: 'Valor líquido creditado ao cliente', valor: fmtBRL(liq) },
          { simbolo: 'Bruto', nome: 'Valor Bruto financiado (PV)', valor: fmtBRL(pv) },
          { simbolo: 'Tarifa', nome: 'Tarifa de abertura de crédito (TAC)', valor: fmtBRL(tarifa) },
          { simbolo: 'IOF', nome: 'IOF total retido (diário + adicional)', valor: fmtBRL(iof) },
        ],
        passos: passosDeTrace(trace),
        regras: [
          regraArredondamento,
          'Se tarifas + tributos excederem o valor bruto (líquido ≤ 0), a operação é inviável e o sistema emite aviso impeditivo.',
        ],
        hp12c: [
          'Cálculo aritmético simples:',
          `${fmtNum(pv)} ENTER ${fmtNum(tarifa)} − ${fmtNum(iof)} −   → ${fmtNum(liq)}`,
        ],
        excel: [
          `=${fmtNum(pv)}-${fmtNum(tarifa)}-${fmtNum(iof)}   → ${fmtNum(liq)}`,
          NOTA_EXCEL_REGIONAL,
        ],
        normas: [NORMA_CET, NORMA_IOF, NORMA_CDC_TRANSPARENCIA],
      };
    }

    case 'iof': {
      const iofD = new Decimal(dados.memoriaCalculo?.iofDiario || '0');
      const iofA = new Decimal(dados.memoriaCalculo?.iofAdicional || '0');
      const iofT = iofD.plus(iofA);

      const trace = montarTrace('iof-total', 'IOF Total', 'IOF_total = IOF_diário + IOF_adicional', [
        passoNota('diario', `Componente diária acumulada (detalhada no card "IOF Diário"): ${fmtBRL(iofD)}.`),
        passoNota('adicional', `Componente adicional fixa de 0,38% (card "IOF Adicional"): ${fmtBRL(iofA)}.`),
        passoNum('total', 'Somar as duas componentes', 'IOF_diário + IOF_adicional', `${disp(iofD, 2)} + ${disp(iofA, 2)}`, iofT),
      ]);

      return {
        titulo: 'IOF Total (Imposto sobre Operações Financeiras)',
        trace,
        formula: 'IOF_total = IOF_diário + IOF_adicional',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<msub><mtext class="fx-v0">IOF</mtext><mtext>total</mtext></msub><mo>=</mo>' +
          '<msub><mtext class="fx-v1">IOF</mtext><mtext>diário</mtext></msub><mo>+</mo>' +
          '<msub><mtext class="fx-v2">IOF</mtext><mtext>adicional</mtext></msub>' +
          '</mrow></math>',
        descricao:
          'O IOF sobre operações de crédito, regulamentado pelo Decreto 6.306/2007, tem DUAS componentes somadas: (1) o IOF diário, proporcional ao prazo — cada parcela de amortização paga a alíquota diária multiplicada pelos dias corridos entre a liberação e o seu vencimento, limitados a 365; e (2) o IOF adicional, uma alíquota fixa de 0,38% sobre o valor total liberado, independente do prazo. O imposto é retido na fonte: sai do valor liberado, não é somado às parcelas.',
        legenda: [
          { simbolo: 'IOF_total', nome: 'Imposto total retido', valor: fmtBRL(iofT) },
          { simbolo: 'IOF_diário', nome: 'Componente proporcional ao prazo', valor: fmtBRL(iofD) },
          { simbolo: 'IOF_adicional', nome: 'Componente fixa (0,38% do principal)', valor: fmtBRL(iofA) },
        ],
        passos: passosDeTrace(trace),
        regras: [
          regraArredondamento,
          'Crédito habitacional (SFH) é isento de IOF — produtos isentos são configurados em regulatory-config.jsonc.',
          'As alíquotas vigentes vivem no arquivo de configuração regulatória, nunca no código.',
        ],
        hp12c: [
          'Soma aritmética das duas componentes:',
          `${fmtNum(iofD)} ENTER ${fmtNum(iofA)} +   → ${fmtNum(iofT)}`,
        ],
        excel: [
          `=${fmtNum(iofD)}+${fmtNum(iofA)}   → ${fmtNum(iofT)}`,
          'Veja os cards "IOF Diário" e "IOF Adicional" para reproduzir cada componente em planilha.',
        ],
        normas: [NORMA_IOF, NORMA_IOF_ISENCAO],
      };
    }

    case 'iofDiario': {
      const iofD = new Decimal(dados.memoriaCalculo?.iofDiario || '0');
      const publicoPJ = resolvidos?.publico === 'PJ';
      const aliquota = publicoPJ ? '0,0041%' : '0,0082%';
      const aliquotaFracao = publicoPJ ? '0,000041' : '0,000082';

      const trace = montarTrace(
        'iof-diario',
        'IOF Diário Acumulado',
        'IOF_diário = Σ [ A_k × α × min(dias_k, 365) ]',
        [
          passoNota('dias', 'Para cada parcela k, contar os dias corridos entre a liberação e o vencimento.'),
          passoNota('teto', 'Limitar a contagem ao teto legal: min(dias_k, 365) — Decreto 6.306/2007.'),
          passoNota('produto', `Multiplicar, por parcela: amortização_k × ${aliquotaFracao} (${aliquota} ao dia) × dias limitados.`),
          passoNum('soma', 'Somar a contribuição de todas as parcelas', 'Σ (A_k × α × dias_k)', 'soma das n parcelas', iofD),
        ],
      );

      return {
        titulo: 'IOF Diário Acumulado',
        trace,
        formula: 'IOF_diário = Σ [ Amortização_k × alíquota_diária × min(dias_k, 365) ]',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<msub><mtext class="fx-v0">IOF</mtext><mtext>diário</mtext></msub><mo>=</mo>' +
          '<munderover><mo>∑</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover>' +
          '<msub><mi class="fx-v1">A</mi><mi>k</mi></msub><mo>·</mo><mi class="fx-v2">α</mi><mo>·</mo>' +
          '<mi>min</mi><mo>(</mo><msub><mi class="fx-v3">d</mi><mi>k</mi></msub><mo>,</mo><mn>365</mn><mo>)</mo>' +
          '</mrow></math>',
        descricao:
          `Cada parcela do cronograma devolve uma fatia do principal (a amortização). O IOF diário tributa cada fatia proporcionalmente ao tempo que ela ficou emprestada: amortização × alíquota diária (${aliquota} ao dia para ${publicoPJ ? 'pessoa jurídica' : 'pessoa física'}) × dias corridos da liberação até o vencimento da parcela. O Decreto 6.306/2007 limita a contagem a 365 dias — parcelas que vencem após 1 ano pagam o teto, o que torna o IOF percentualmente menos relevante em prazos longos.`,
        legenda: [
          { simbolo: 'IOF_diário', nome: 'IOF diário acumulado de todas as parcelas', valor: fmtBRL(iofD) },
          { simbolo: 'Amortização_k', nome: 'Principal devolvido na parcela k', valor: 'varia por parcela' },
          { simbolo: 'alíquota_diária', nome: `Alíquota diária (PF: 0,0082% / PJ: 0,0041%)`, valor: `${aliquota} ao dia` },
          { simbolo: 'dias_k', nome: 'Dias corridos da liberação ao vencimento k', valor: 'varia por parcela' },
        ],
        passos: passosDeTrace(trace),
        regras: [
          'Teto de 365 dias e alíquotas definidos no Decreto 6.306/2007 e parametrizados em regulatory-config.jsonc.',
          regraArredondamento,
        ],
        hp12c: [
          'Não há função nativa; calcule parcela a parcela e acumule na memória:',
          `Para cada parcela: amortização ENTER ${aliquotaFracao.replace('0,', ',')} × dias × STO + 0`,
          'Ao final: RCL 0 → IOF diário total.',
        ],
        excel: [
          'Monte colunas: B = amortização da parcela, C = dias corridos até o vencimento.',
          `Por linha: =B2*${aliquotaFracao}*MÍNIMO(C2;365)`,
          `Total: =SOMA(D2:D${n + 1})   → ${fmtNum(iofD)}`,
          'Dias corridos no Excel: =data_vencimento-data_liberação (subtração direta de datas).',
        ],
        normas: [NORMA_IOF],
      };
    }

    case 'iofAdicional': {
      const iofA = new Decimal(dados.memoriaCalculo?.iofAdicional || '0');
      const iofABruto = pv.times('0.0038');

      const trace = montarTrace('iof-adicional', 'IOF Adicional Fixo (0,38%)', 'IOF_adicional = PV × 0,0038', [
        passoNum('produto', 'Multiplicar o principal pela alíquota fixa de 0,38%', 'PV × 0,0038', `${disp(pv, 2)} × 0,0038`, iofABruto),
        passoNum('arred', 'Arredondar para centavos (2 casas)', 'arred(PV × 0,0038)', disp(iofABruto, 6), iofA),
      ]);

      return {
        titulo: 'IOF Adicional Fixo (0,38%)',
        trace,
        formula: 'IOF_adicional = PV × 0,0038',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<msub><mtext class="fx-v0">IOF</mtext><mtext>adicional</mtext></msub><mo>=</mo>' +
          '<mi class="fx-v1">PV</mi><mo>·</mo><mn class="fx-v2">0,0038</mn>' +
          '</mrow></math>',
        descricao:
          'Componente fixa do IOF criada pelo Decreto 6.306/2007 (art. 7º, § 15): 0,38% sobre o valor total da operação de crédito, cobrada uma única vez no ato da liberação, independentemente do prazo. Diferente do IOF diário, ela não cresce com o tempo — incide igualmente sobre uma operação de 1 mês ou de 5 anos.',
        legenda: [
          { simbolo: 'IOF_adicional', nome: 'IOF adicional retido', valor: fmtBRL(iofA) },
          { simbolo: 'PV', nome: 'Valor Bruto do crédito', valor: fmtBRL(pv) },
          { simbolo: 'alíquota', nome: 'Alíquota adicional fixa', valor: '0,38%' },
        ],
        passos: passosDeTrace(trace),
        regras: [regraArredondamento],
        hp12c: [
          `${fmtNum(pv)} ENTER ,38 %   → ${fmtNum(iofA)}`,
        ],
        excel: [
          `=${fmtNum(pv)}*0,38%   → ${fmtNum(iofA)}`,
          NOTA_EXCEL_REGIONAL,
        ],
        normas: [NORMA_IOF],
      };
    }

    case 'totalPago': {
      const totPago = new Decimal(dados.totais?.totalParcelas || '0');
      const totJuros = new Decimal(dados.totais?.totalJuros || '0');

      const trace = montarTrace('total-pago', 'Total Pago pelo Cliente', 'Total = Σ PMT_k = PV + Juros', [
        passoNota('soma', 'Somar o valor final de todas as parcelas do cronograma.'),
        passoNum('total', 'Equivale ao principal mais o total de juros', 'PV + Juros', `${disp(pv, 2)} + ${disp(totJuros, 2)}`, totPago),
      ]);

      return {
        titulo: 'Total Pago pelo Cliente',
        trace,
        formula: 'Total Pago = Σ PMT_k = PV + Total de Juros',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<mtext class="fx-v0">Total</mtext><mo>=</mo>' +
          '<munderover><mo>∑</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover>' +
          '<msub><mi>PMT</mi><mi>k</mi></msub><mo>=</mo>' +
          '<mi class="fx-v1">PV</mi><mo>+</mo><mtext class="fx-v2">Juros</mtext>' +
          '</mrow></math>',
        descricao:
          'Soma nominal de todas as prestações do cronograma. Como cada parcela é composta de amortização + juros, e a soma das amortizações fecha exatamente no principal, o total pago equivale ao valor financiado mais o total de juros. Atenção: é uma soma NOMINAL — não desconta o valor do dinheiro no tempo. Para comparar o custo real entre propostas, use o CET, não o total pago.',
        legenda: [
          { simbolo: 'Total Pago', nome: 'Soma nominal de todas as parcelas', valor: fmtBRL(totPago) },
          { simbolo: 'PV', nome: 'Principal (soma das amortizações)', valor: fmtBRL(pv) },
          { simbolo: 'Σ Juros', nome: 'Total de juros do cronograma', valor: fmtBRL(totJuros) },
        ],
        passos: passosDeTrace(trace),
        regras: [
          'A última parcela absorve os desvios de arredondamento acumulados, garantindo o fechamento exato.',
        ],
        hp12c: [
          'Some as parcelas acumulando na memória: parcela STO + 0 (repetir) e RCL 0 ao final.',
          `No Price (parcelas iguais): ${fmtNum(new Decimal(dados.parcelaCalculada || '0'))} ENTER ${n} ×   → aproximação (a última parcela pode variar centavos).`,
        ],
        excel: [
          `=SOMA(coluna_das_parcelas)   → ${fmtNum(totPago)}`,
        ],
        normas: [NORMA_CDC_TRANSPARENCIA],
      };
    }

    case 'totalJuros': {
      const totJuros = new Decimal(dados.totais?.totalJuros || '0');
      const pctPrincipal = pv.isZero() ? new Decimal(0) : totJuros.div(pv).times(100);

      const trace = montarTrace('total-juros', 'Total de Juros Acumulado', 'Total Juros = Σ (Saldo_(k−1) × i)', [
        passoNota('porPeriodo', 'Em cada período k: juros_k = saldo devedor do início do mês × taxa mensal.'),
        passoNota('soma', 'Somar os juros de todas as parcelas do cronograma.'),
        passoNum('total', `Total apurado — equivale a ${fmtPct(pctPrincipal, 2)} do principal (nominal)`, 'Σ juros_k', 'soma dos juros das n parcelas', totJuros),
      ]);

      return {
        titulo: 'Total de Juros Acumulado',
        trace,
        formula: 'Total Juros = Σ ( Saldo_(k−1) × i )',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<mtext class="fx-v0">Juros</mtext><mo>=</mo>' +
          '<munderover><mo>∑</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover>' +
          '<msub><mi class="fx-v1">S</mi><mrow><mi>k</mi><mo>−</mo><mn>1</mn></mrow></msub><mo>·</mo><mi class="fx-v2">i</mi>' +
          '</mrow></math>',
        descricao:
          'Acumula os juros cobrados em todas as parcelas. Em ambos os sistemas (Price e SAC), os juros de cada mês são calculados aplicando a taxa sobre o SALDO DEVEDOR do início do período — nunca sobre o valor original. É por isso que amortizações antecipadas economizam juros: elas reduzem o saldo sobre o qual os juros futuros incidiriam.',
        legenda: [
          { simbolo: 'Total Juros', nome: 'Soma dos juros de todas as parcelas', valor: fmtBRL(totJuros) },
          { simbolo: 'Saldo_(k−1)', nome: 'Saldo devedor no início do período k', valor: 'varia por parcela' },
          { simbolo: 'i', nome: 'Taxa mensal', valor: taxaExibicao },
        ],
        passos: passosDeTrace(trace),
        regras: [regraArredondamento],
        hp12c: [
          `Pelo total pago: total pago ENTER ${fmtNum(pv)} −   → juros = ${fmtNum(totJuros)}`,
        ],
        excel: [
          `=SOMA(coluna_de_juros)   → ${fmtNum(totJuros)}`,
          `Ou por diferença: =total_pago-${fmtNum(pv)}`,
        ],
        normas: [NORMA_CDC_TRANSPARENCIA],
      };
    }

    case 'cetMensal':
    case 'cetAnual': {
      const cMensal = new Decimal(dados.cetMensal || '0');
      const cAnual = new Decimal(dados.cetAnual || '0');
      const liq = new Decimal(dados.valorLiquido || '0');

      const trace = montarTrace(
        topico === 'cetMensal' ? 'cet-mensal' : 'cet-anual',
        topico === 'cetMensal' ? 'CET Mensal' : 'CET Anual',
        'Líquido = Σ [ PMT_k / (1 + CET_a)^(dias_k/365) ]',
        [
          passoNota('fluxo', `Montar o fluxo de caixa: recebimento de ${fmtBRL(liq)} na data zero (líquido, não o bruto) e os pagamentos nas datas de vencimento.`),
          passoNota('dias', 'Converter cada prazo para a convenção BACEN: t_k = dias corridos / 365 (anos fracionários).'),
          passoNota('tir', 'Resolver numericamente (Newton-Raphson com fallback de bisseção) a taxa anual que iguala o valor presente dos pagamentos ao valor liberado.'),
          passoNum('anual', 'CET anual encontrado (TIR do fluxo)', 'CET_anual', 'raiz da equação do fluxo', cAnual, 6),
          passoNum('mensal', 'Converter para o mês por equivalência composta', '(1 + CET_anual)^(1/12) − 1', `(1 + ${disp(cAnual, 6)})^(1/12) − 1`, cMensal, 6),
        ],
      );

      return {
        titulo: topico === 'cetMensal' ? 'CET Mensal (Custo Efetivo Total)' : 'CET Anual (Custo Efetivo Total)',
        trace,
        formula: 'Líquido = Σ [ PMT_k / (1 + CET_anual)^(dias_k/365) ]    e    CET_mensal = (1 + CET_anual)^(1/12) − 1',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<mtext class="fx-v0">Líquido</mtext><mo>=</mo>' +
          '<munderover><mo>∑</mo><mrow><mi>k</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover>' +
          '<mfrac><msub><mi class="fx-v1">PMT</mi><mi>k</mi></msub>' +
          '<msup><mrow><mo>(</mo><mn>1</mn><mo>+</mo><msub><mtext class="fx-v4">CET</mtext><mtext>a</mtext></msub><mo>)</mo></mrow>' +
          '<mfrac><msub><mi class="fx-v2">d</mi><mi>k</mi></msub><mn>365</mn></mfrac></msup></mfrac>' +
          '<mspace width="1.2em"></mspace><mtext>e</mtext><mspace width="1.2em"></mspace>' +
          '<msub><mtext class="fx-v3">CET</mtext><mtext>m</mtext></msub><mo>=</mo>' +
          '<msup><mrow><mo>(</mo><mn>1</mn><mo>+</mo><msub><mtext class="fx-v4">CET</mtext><mtext>a</mtext></msub><mo>)</mo></mrow>' +
          '<mfrac><mn>1</mn><mn>12</mn></mfrac></msup><mo>−</mo><mn>1</mn>' +
          '</mrow></math>',
        descricao:
          'O CET é a medida OFICIAL do custo de um crédito no Brasil, exigida pela Resolução CMN 4.881/2020. Ele responde: "considerando TUDO que pago (parcelas) e o que de fato recebi (líquido, já descontados IOF e tarifas), qual taxa única resume esta operação?". Tecnicamente é a Taxa Interna de Retorno (TIR) do fluxo de caixa, com uma regra de contagem específica do BACEN: o prazo de cada pagamento entra como dias corridos divididos por 365. Como o CET incorpora tributos e tarifas, ele é SEMPRE maior ou igual à taxa de juros contratada — é o número certo para comparar propostas de bancos diferentes.',
        legenda: [
          { simbolo: 'Líquido', nome: 'Valor efetivamente liberado (base do CET)', valor: fmtBRL(liq) },
          { simbolo: 'PMT_k', nome: 'Pagamento na data k (parcela + encargos)', valor: 'varia por parcela' },
          { simbolo: 'dias_k', nome: 'Dias corridos da liberação ao pagamento k', valor: 'varia por parcela' },
          { simbolo: 'CET_mensal', nome: 'CET expresso ao mês', valor: fmtPct(cMensal.times(100), 4) },
          { simbolo: 'CET_anual', nome: 'CET expresso ao ano', valor: fmtPct(cAnual.times(100), 2) },
        ],
        passos: passosDeTrace(trace),
        regras: [
          'Convenção regulatória: dias corridos / 365 (Resolução CMN 4.881/2020, anexo de metodologia).',
          'A base de cálculo inclui IOF e tarifa de abertura: eles reduzem o valor liberado e por isso elevam o CET.',
          'Resolvido com tolerância < 10⁻¹⁰, parametrizada em regulatory-config.jsonc.',
        ],
        hp12c: [
          'Use os registradores de fluxo de caixa (aproximação mensal; a HP12C não conta dias/365):',
          `f CLX`,
          `${fmtNum(liq)} CHS g CF0   (valor líquido recebido, sinal negativo na ótica do banco)`,
          `${fmtNum(new Decimal(dados.parcelaCalculada || '0'))} g CFj   (parcela)`,
          `${n} g Nj   (repete a parcela ${n} vezes)`,
          'f IRR   → TIR mensal aproximada. Multiplique por 12 períodos compostos para anualizar.',
          'Obs.: o resultado difere levemente do CET oficial porque a HP12C assume períodos uniformes, não dias corridos/365.',
        ],
        excel: [
          'Forma exata (convenção BACEN, pois o XTIR usa dias/365):',
          `=XTIR(valores; datas)   onde valores = {-${fmtNum(liq)}; parcela₁; ...; parcelaₙ} e datas = {liberação; venc₁; ...; vencₙ}`,
          `O XTIR retorna o CET ANUAL diretamente: ${fmtPct(cAnual.times(100), 2)}.`,
          `Para o mensal: =(1+XTIR(...))^(1/12)-1   → ${fmtPct(cMensal.times(100), 4)}`,
          'Aproximação mensal simples: =TIR({-líquido; parcelas...}) com fluxos mensais uniformes.',
          NOTA_EXCEL_REGIONAL,
        ],
        normas: [NORMA_CET, NORMA_CDC_TRANSPARENCIA, NORMA_IOF],
      };
    }

    // --- PÓS-EVENTOS ---
    case 'prazoFinal': {
      const prazoFinalN = new Decimal(dados.resumo?.prazoFinal || '0');

      const trace = montarTrace('prazo-final', 'Prazo Final Pós-Eventos', 'Prazo final = min { k : Saldo_k = 0 }', [
        passoNota('eventos', 'Aplicar cada evento (amortização extra, antecipação ou quitação) em ordem cronológica, abatendo o saldo na data correspondente.'),
        passoNota('reproj', 'Reprojetar o cronograma parcela a parcela: juros sobre o novo saldo, amortização conforme o sistema (Price ou SAC).'),
        passoNum('n', 'Parcela em que o saldo devedor zera', 'min { k : Saldo_k = 0 }', `${dados.resumo?.prazoFinal} meses`, prazoFinalN, 0),
      ]);

      return {
        titulo: 'Prazo Final Pós-Eventos',
        trace,
        formula: 'Prazo final = nº da parcela em que o saldo devedor chega a zero',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<mtext class="fx-v0">Prazo final</mtext><mo>=</mo><mi>min</mi>' +
          '<mo>{</mo><mi>k</mi><mo>:</mo><msub><mi>S</mi><mi>k</mi></msub><mo>=</mo><mn>0</mn><mo>}</mo>' +
          '</mrow></math>',
        descricao:
          'Quando o cliente faz amortizações extraordinárias com a opção "reduzir prazo", o valor da parcela é mantido e o cronograma simplesmente acaba mais cedo: o aporte abate o saldo devedor, e o motor reprojeta o cronograma até detectar a parcela em que o saldo zera. Pelo CDC (art. 52, § 2º), a liquidação antecipada total ou parcial é um DIREITO do consumidor, com redução proporcional dos juros — o banco não pode cobrar os juros "futuros" das parcelas eliminadas.',
        legenda: [
          { simbolo: 'Prazo final', nome: 'Nova quantidade de parcelas', valor: `${dados.resumo?.prazoFinal} meses` },
        ],
        passos: passosDeTrace(trace),
        regras: [
          'O cronograma é função determinística de (contrato base + lista de eventos): remover um evento reprojeta tudo sem ele.',
          'A amortização que zera o saldo encerra o contrato imediatamente.',
        ],
        hp12c: [
          'Após abater o aporte do saldo, recalcule o prazo restante:',
          'saldo_após_aporte CHS PV ; parcela PMT ; taxa i ; n   → parcelas restantes.',
        ],
        excel: [
          '=NPER(taxa; -parcela; saldo_após_aporte)   → parcelas restantes após a amortização extra.',
        ],
        normas: [NORMA_CDC_LIQUIDACAO, NORMA_RES_3516],
      };
    }

    case 'economiaJuros': {
      const originalJ = new Decimal(dados.totaisOriginal?.totalJuros || '0');
      const novoJ = new Decimal(dados.totais?.totalJuros || '0');
      const economia = new Decimal(dados.resumo?.economiaJuros || '0');

      const trace = montarTrace('economia-juros', 'Economia de Juros Obtida', 'Economia = Juros_original − Juros_eventos', [
        passoNota('orig', `Total de juros do cronograma base, sem eventos: ${fmtBRL(originalJ)}.`),
        passoNota('novo', `Total de juros do cronograma reprojetado, com os eventos: ${fmtBRL(novoJ)}.`),
        passoNum('dif', 'Diferença — juros que o cliente deixou de pagar', 'Juros_original − Juros_eventos', `${disp(originalJ, 2)} − ${disp(novoJ, 2)}`, economia),
      ]);

      return {
        titulo: 'Economia de Juros Obtida',
        trace,
        formula: 'Economia = Juros_do_cronograma_original − Juros_do_cronograma_com_eventos',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<mtext class="fx-v0">Economia</mtext><mo>=</mo>' +
          '<msub><mtext class="fx-v1">Juros</mtext><mtext>original</mtext></msub><mo>−</mo>' +
          '<msub><mtext class="fx-v2">Juros</mtext><mtext>eventos</mtext></msub>' +
          '</mrow></math>',
        descricao:
          'Mede quanto o cliente deixou de pagar em juros graças às amortizações extras e antecipações. O mecanismo: juros são sempre calculados sobre o saldo devedor; cada real amortizado antecipadamente para de render juros para o banco em todos os meses seguintes. Por isso, quanto MAIS CEDO o aporte, maior a economia — o mesmo valor amortizado na parcela 2 economiza mais do que na parcela 10.',
        legenda: [
          { simbolo: 'Economia', nome: 'Juros economizados', valor: fmtBRL(economia) },
          { simbolo: 'Juros originais', nome: 'Total de juros sem eventos', valor: fmtBRL(originalJ) },
          { simbolo: 'Juros novos', nome: 'Total de juros com eventos', valor: fmtBRL(novoJ) },
        ],
        passos: passosDeTrace(trace),
        regras: [
          regraArredondamento,
          'A redução proporcional dos juros na liquidação antecipada é garantida por lei (CDC art. 52, § 2º).',
        ],
        hp12c: [
          `${fmtNum(originalJ)} ENTER ${fmtNum(novoJ)} −   → ${fmtNum(economia)}`,
        ],
        excel: [
          `=${fmtNum(originalJ)}-${fmtNum(novoJ)}   → ${fmtNum(economia)}`,
        ],
        normas: [NORMA_CDC_LIQUIDACAO, NORMA_RES_3516],
      };
    }

    case 'amortizacoesExtras': {
      const extra = new Decimal(dados.resumo?.amortizacoesExtras || '0');

      const trace = montarTrace('amort-extras', 'Amortizações Extras Totais', 'Extras = Σ aportes de principal', [
        passoNota('somaApor', 'Somar o valor de cada amortização extra aplicada ao saldo devedor.'),
        passoNota('vp', 'Nas antecipações de parcelas, somar o valor PRESENTE delas (descontado pela taxa do contrato), não o nominal — Resolução CMN 3.516/2007.'),
        passoNum('total', 'Total amortizado fora das parcelas regulares', 'Σ aportes', 'soma dos aportes de principal', extra),
      ]);

      return {
        titulo: 'Amortizações Extras Totais',
        trace,
        formula: 'Amortizações Extras = Σ aportes voluntários de principal',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<mtext class="fx-v0">Extras</mtext><mo>=</mo>' +
          '<mo>∑</mo><mtext>aportes de principal fora das parcelas</mtext>' +
          '</mrow></math>',
        descricao:
          'Acumula todo o principal pago FORA das parcelas regulares: amortizações avulsas, antecipações de parcelas (pelo valor presente) e quitação antecipada. Importante: na antecipação de parcelas, o cliente NÃO paga o valor nominal das parcelas futuras — paga o valor presente delas, descontado pela taxa do contrato (os juros embutidos são abatidos), conforme a Resolução CMN 3.516/2007.',
        legenda: [
          { simbolo: 'Extras', nome: 'Total amortizado fora das parcelas', valor: fmtBRL(extra) },
        ],
        passos: passosDeTrace(trace),
        regras: [
          'Cada aporte reduz o saldo devedor imediatamente na data do evento.',
          'É vedada a cobrança de tarifa pela liquidação antecipada (Resolução CMN 3.516/2007).',
        ],
        hp12c: [
          'Valor presente de parcelas antecipadas: parcela ENTER, dividir por (1+i)^k para cada parcela k antecipada e somar.',
          'Ou: quantidade n, taxa i, parcela PMT, PV   → valor presente do bloco antecipado.',
        ],
        excel: [
          '=VP(taxa; qtd_parcelas_antecipadas; -parcela)   → valor a pagar para antecipar o bloco.',
        ],
        normas: [NORMA_CDC_LIQUIDACAO, NORMA_RES_3516],
      };
    }

    case 'moraEncargos': {
      const encargos = new Decimal(dados.resumo?.totalEncargos || '0');

      const trace = montarTrace('mora-encargos', 'Mora e Multas de Atraso', 'Encargos = Σ (Parcela × multa) + Σ (Parcela × i_mora × dias/30)', [
        passoNota('multa', 'Para cada parcela em atraso: multa = parcela × percentual de multa (limitado a 2% pelo CDC).'),
        passoNota('mora', 'Juros de mora pro-rata: parcela × taxa mensal de mora × (dias de atraso / 30).'),
        passoNum('total', 'Somar multa + juros de mora de todos os atrasos', 'Σ (multa + mora)', 'soma dos encargos de cada atraso', encargos),
      ]);

      return {
        titulo: 'Mora e Multas de Atraso Acumuladas',
        trace,
        formula: 'Encargos = Σ [ Parcela × multa ] + Σ [ Parcela × i_mora × (dias_atraso / 30) ]',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<mtext class="fx-v0">Encargos</mtext><mo>=</mo>' +
          '<mi>P</mi><mo>·</mo><mtext class="fx-v1">multa</mtext><mo>+</mo>' +
          '<mi>P</mi><mo>·</mo><msub><mi class="fx-v2">i</mi><mtext>mora</mtext></msub><mo>·</mo>' +
          '<mfrac><mtext>dias</mtext><mn>30</mn></mfrac>' +
          '</mrow></math>',
        descricao:
          'Quando uma parcela é paga com atraso, incidem dois encargos sobre o valor da prestação vencida: a MULTA moratória, percentual fixo cobrado uma única vez (limitada a 2% pelo CDC art. 52, § 1º), e os JUROS DE MORA, proporcionais ao tempo de atraso — a taxa mensal é convertida pro-rata pelos dias (dias/30). Os encargos não alteram o saldo devedor: são uma penalidade somada à parcela em atraso.',
        legenda: [
          { simbolo: 'Encargos', nome: 'Total de multa + juros de mora', valor: fmtBRL(encargos) },
          { simbolo: 'multa', nome: 'Multa moratória (máx. 2% — CDC)', valor: 'configurada' },
          { simbolo: 'i_mora', nome: 'Juros de mora mensais', valor: 'configurada' },
        ],
        passos: passosDeTrace(trace),
        regras: [
          'Multa limitada a 2% da prestação em relações de consumo (CDC art. 52, § 1º).',
          'Tetos de multa e mora parametrizados em regulatory-config.jsonc.',
          regraArredondamento,
        ],
        hp12c: [
          'Multa: parcela ENTER 2 %   → multa de 2%.',
          'Mora: parcela ENTER taxa_mora % dias × 30 ÷   → juros pro-rata.',
          'Somar os dois resultados.',
        ],
        excel: [
          '=parcela*2% + parcela*taxa_mora*(dias_atraso/30)',
          NOTA_EXCEL_REGIONAL,
        ],
        normas: [NORMA_CDC_MULTA, NORMA_CC_MORA],
      };
    }

    case 'totalPagoPos': {
      const totalP = new Decimal(dados.totais?.totalParcelas || '0');

      const trace = montarTrace('total-pago-pos', 'Total Pago Pós-Eventos', 'Total = Σ parcelas + Σ extras + Σ mora', [
        passoNota('parc', 'Somar todas as parcelas do cronograma reprojetado pelos eventos.'),
        passoNota('extras', 'Somar as amortizações extras e antecipações (pelo valor efetivamente pago).'),
        passoNota('mora', 'Somar multas e juros de mora de eventuais atrasos.'),
        passoNum('total', 'Desembolso total acumulado pelo cliente', 'Σ parcelas + Σ extras + Σ mora', 'soma de todas as saídas de caixa', totalP),
      ]);

      return {
        titulo: 'Total Pago Pós-Eventos',
        trace,
        formula: 'Total Pago = Σ parcelas reprojetadas + amortizações extras + encargos de mora',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<mtext class="fx-v0">Total</mtext><mo>=</mo>' +
          '<mo>∑</mo><mtext>parcelas</mtext><mo>+</mo>' +
          '<mo>∑</mo><mtext>extras</mtext><mo>+</mo>' +
          '<mo>∑</mo><mtext>mora</mtext>' +
          '</mrow></math>',
        descricao:
          'Soma TODAS as saídas de caixa do cliente no cronograma com eventos: as parcelas regulares (possivelmente recalculadas pelos eventos), os aportes extraordinários de amortização e as penalidades por atraso. Compare com o "Total Pago" da simulação base para ver o efeito líquido dos eventos no desembolso total.',
        legenda: [
          { simbolo: 'Total Pago', nome: 'Desembolso total acumulado', valor: fmtBRL(totalP) },
        ],
        passos: passosDeTrace(trace),
        regras: [regraArredondamento],
        hp12c: [
          'Acumule cada desembolso na memória: valor STO + 0 (repetir); RCL 0 ao final.',
        ],
        excel: [
          '=SOMA(parcelas) + SOMA(amortizações_extras) + SOMA(encargos)',
        ],
        normas: [NORMA_CDC_TRANSPARENCIA],
      };
    }

    case 'cetMensalPos': {
      const cetM = new Decimal(dados.cetMensal || '0');

      const trace = montarTrace('cet-mensal-pos', 'CET Mensal Pós-Eventos', 'Liberado = Σ [ pagamento_k / (1 + i)^(dias_k/365) ]', [
        passoNota('fluxo', 'Reconstituir o fluxo: valor liberado na data zero; cada pagamento (parcela, aporte, mora) na sua data real.'),
        passoNota('dias', 'Converter os prazos para dias corridos / 365 (convenção BACEN).'),
        passoNota('tir', 'Resolver a TIR numericamente (Newton-Raphson + bisseção).'),
        passoNum('mensal', 'CET mensal do fluxo realizado', 'TIR mensal', 'raiz do fluxo de caixa real', cetM, 6),
      ]);

      return {
        titulo: 'CET Mensal Pós-Eventos (fluxo realizado)',
        trace,
        formula: 'Resolver a TIR do fluxo de caixa REAL:  Liberado = Σ [ pagamento_k / (1 + i)^(dias_k/365) ]',
        formulaMathML:
          '<math display="block"><mrow>' +
          '<mtext>Liberado</mtext><mo>=</mo>' +
          '<mo>∑</mo>' +
          '<mfrac><msub><mtext>pagamento</mtext><mi>k</mi></msub>' +
          '<msup><mrow><mo>(</mo><mn>1</mn><mo>+</mo><mtext class="fx-v0">CET</mtext><mo>)</mo></mrow>' +
          '<mfrac><msub><mi>d</mi><mi>k</mi></msub><mn>365</mn></mfrac></msup></mfrac>' +
          '</mrow></math>',
        descricao:
          'Recalcula o Custo Efetivo Total considerando o que de fato aconteceu: parcelas pagas, amortizações extras nas suas datas reais, antecipações e encargos de mora. É o "CET realizado" da operação, em contraste com o CET contratado da simulação base. Usa a mesma convenção regulatória do BACEN (dias corridos / 365). Amortizações antecipadas tendem a manter o CET próximo à taxa contratual; atrasos com mora o elevam.',
        legenda: [
          { simbolo: 'CET mensal', nome: 'Taxa efetiva do fluxo realizado', valor: fmtPct(cetM.times(100), 4) },
        ],
        passos: passosDeTrace(trace),
        regras: [
          'Mesma convenção e tolerância do CET base (Resolução CMN 4.881/2020).',
        ],
        hp12c: [
          'Fluxos irregulares: registre cada valor com g CFj na ordem das datas (CF0 = líquido com CHS) e calcule f IRR.',
          'Obs.: a HP12C assume períodos uniformes entre fluxos — para datas irregulares o resultado é aproximado.',
        ],
        excel: [
          '=XTIR(valores; datas)   → CET anual exato com datas reais (usa dias/365, igual ao BACEN).',
          '=(1+XTIR(...))^(1/12)-1   → CET mensal.',
        ],
        normas: [NORMA_CET, NORMA_CDC_LIQUIDACAO],
      };
    }

    default:
      return null;
  }
}
