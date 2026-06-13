import { Decimal } from '../../core/engine/decimal.config';
import { SistemaAmortizacao } from '../../core/engine/models';
import { taxaEfetivaMensal } from '../../core/engine/rates';

/** Referência a uma norma brasileira (lei, decreto ou normativo BACEN/CMN). */
export interface ReferenciaNormativa {
  rotulo: string;
  descricao: string;
  url: string;
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

/** Retorna a explicação detalhada do cálculo de um campo com valores dinâmicos */
export function obterExplicacaoMatematica(
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

  switch (topico) {
    case 'parcela': {
      if (sistema === 'price') {
        const iVal = iMensal;
        const fatorJuros = iVal.plus(1); // 1 + i
        const fatorPotencia = fatorJuros.pow(-n); // (1+i)^-n
        const denom = new Decimal(1).minus(fatorPotencia); // 1 - (1+i)^-n
        const fatorAmort = denom.isZero() ? new Decimal(0) : iVal.div(denom);
        const pmtCalculado = pv.times(fatorAmort);
        const pmtFmt = fmtNum(new Decimal(dados.parcelaCalculada || pmtCalculado));

        return {
          titulo: 'Parcela (PMT) — Sistema Price (Tabela Price)',
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
          passos: [
            `1. Somar 1 à taxa de juros: 1 + i = 1 + ${iVal.toString()} = ${fatorJuros.toFixed(6)}`,
            `2. Elevar à potência negativa do prazo: (1 + i)^−n = (${fatorJuros.toFixed(6)})^−${n} = ${fatorPotencia.toFixed(6)} — este é o fator de desconto da última parcela.`,
            `3. Subtrair de 1: 1 − (1 + i)^−n = 1 − ${fatorPotencia.toFixed(6)} = ${denom.toFixed(6)}`,
            `4. Dividir a taxa pelo resultado (fator de recuperação de capital): i / denominador = ${iVal.toString()} / ${denom.toFixed(6)} = ${fatorAmort.toFixed(6)}`,
            `5. Multiplicar pelo principal: PMT = ${fmtBRL(pv)} × ${fatorAmort.toFixed(6)} = ${fmtBRL(pmtCalculado)}`,
            `6. Arredondar para 2 casas decimais (regra abaixo): ${fmtBRL(dados.parcelaCalculada)}`,
          ],
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
        // SAC
        const amort = pv.div(n);
        const juros1 = pv.times(iMensal);
        const pmt1 = amort.plus(juros1);

        return {
          titulo: 'Primeira Parcela (PMT₁) — Sistema SAC',
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
            `1. Calcular a amortização constante: A = PV / n = ${fmtBRL(pv)} / ${n} = ${fmtBRL(amort)}`,
            `2. Calcular os juros do 1º mês sobre o saldo inicial: J₁ = PV × i = ${fmtBRL(pv)} × ${iMensal.toString()} = ${fmtBRL(juros1)}`,
            `3. Somar amortização e juros: PMT₁ = A + J₁ = ${fmtBRL(amort)} + ${fmtBRL(juros1)} = ${fmtBRL(pmt1)}`,
            `4. Para as parcelas seguintes (k > 1), os juros caem porque o saldo diminui: Saldo_(k−1) = PV − A × (k − 1). A parcela k é A + Saldo_(k−1) × i.`,
            `5. A redução de uma parcela para a próxima é constante: ΔPMT = A × i = ${fmtBRL(amort.times(iMensal))} a menos por mês.`,
          ],
          regras: [
            regraArredondamento,
            'O arredondamento da cota de amortização (PV/n) pode deixar resíduo de centavos. O motor corrige a amortização da ÚLTIMA parcela para liquidar exatamente o saldo devedor.',
          ],
          hp12c: [
            'A HP12C não possui função nativa para SAC — o cálculo é aritmético:',
            `${fmtNum(pv)} ENTER ${n} ÷   → amortização constante A = ${fmtNum(amort)}`,
            `${fmtNum(pv)} ENTER ${fmtNum(iPct, 4)} %   → juros do 1º mês J₁ = ${fmtNum(juros1)}`,
            `+   → primeira parcela PMT₁ = ${fmtNum(pmt1)}`,
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
        const iVal = iMensal;
        const fatorJuros = iVal.plus(1);
        const fatorPotencia = fatorJuros.pow(-n);
        const denom = new Decimal(1).minus(fatorPotencia);
        const fatorAmort = denom.isZero() ? new Decimal(0) : iVal.div(denom);
        const pmt = new Decimal(dados.parcelaCalculada);
        const pvCalculado = fatorAmort.isZero() ? new Decimal(0) : pmt.div(fatorAmort);

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
            { simbolo: 'PV', nome: 'Valor Bruto financiável', valor: fmtBRL(pv) },
            { simbolo: 'PMT', nome: 'Parcela periódica fixada', valor: fmtBRL(pmt) },
            { simbolo: 'i', nome: 'Taxa de juros mensal', valor: taxaExibicao },
            { simbolo: 'n', nome: 'Prazo em meses', valor: String(n) },
          ],
          passos: [
            `1. Somar 1 à taxa: 1 + i = ${fatorJuros.toFixed(6)}`,
            `2. Calcular o fator de desconto total: (1 + i)^−n = ${fatorPotencia.toFixed(6)}`,
            `3. Subtrair de 1: 1 − (1 + i)^−n = ${denom.toFixed(6)}`,
            `4. Dividir pela taxa (fator de valor presente da anuidade): ${denom.toFixed(6)} / ${iVal.toString()} = ${fatorAmort.isZero() ? '—' : new Decimal(1).div(fatorAmort).toFixed(6)}`,
            `5. Multiplicar pela parcela: PV = ${fmtBRL(pmt)} × fator = ${fmtBRL(pvCalculado)}`,
            `6. Arredondar para 2 casas decimais.`,
          ],
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
        const fator = new Decimal(1).div(n).plus(iMensal);
        const pvCalculado = pmt1.div(fator);

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
            { simbolo: 'PV', nome: 'Valor Bruto financiável', valor: fmtBRL(pv) },
            { simbolo: 'PMT₁', nome: 'Primeira parcela fixada (a maior)', valor: fmtBRL(pmt1) },
            { simbolo: 'i', nome: 'Taxa de juros mensal', valor: taxaExibicao },
            { simbolo: 'n', nome: 'Prazo em meses', valor: String(n) },
          ],
          passos: [
            `1. Calcular a fração de amortização por período: 1/n = 1/${n} = ${new Decimal(1).div(n).toFixed(6)}`,
            `2. Somar a taxa mensal: 1/n + i = ${new Decimal(1).div(n).toFixed(6)} + ${iMensal.toString()} = ${fator.toFixed(6)}`,
            `3. Dividir a primeira parcela pelo fator: PV = ${fmtBRL(pmt1)} / ${fator.toFixed(6)} = ${fmtBRL(pvCalculado)}`,
          ],
          regras: [regraArredondamento],
          hp12c: [
            'Cálculo aritmético (sem registradores financeiros):',
            `${n} 1/x   → 1/n = ${new Decimal(1).div(n).toFixed(6)}`,
            `${fmtNum(iPct, 4)} ENTER 100 ÷ +   → soma a taxa em fração: ${fator.toFixed(6)}`,
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
      return {
        titulo: 'Taxa de Juros (i) — Resolução por Métodos Numéricos',
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
        passos: [
          '1. Definir f(i) = [valor presente das parcelas à taxa i] − PV. A raiz de f é a taxa procurada.',
          '2. Newton-Raphson: i_(j+1) = i_j − f(i_j) / f\'(i_j). Cada iteração usa a inclinação da curva para saltar mais perto da raiz (convergência quadrática: o nº de casas corretas dobra por passo).',
          '3. Se a derivada zerar ou a iteração sair do domínio válido (i ≤ −100%), o motor chaveia para a bisseção: corta o intervalo ao meio repetidamente, mantendo a metade onde f troca de sinal.',
          '4. A convergência é declarada quando |f(i)| < 10⁻¹⁰ (tolerância do motor).',
          `5. Taxa encontrada: i = ${iMensal.toFixed(8)} → ${taxaExibicao} ao mês.`,
        ],
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

    case 'prazo': {
      if (sistema === 'price') {
        const pmt = new Decimal(dados.parcelaCalculada);
        const termoNum = new Decimal(1).minus(pv.times(iMensal).div(pmt));
        const lnNum = Math.log(termoNum.toNumber());
        const lnDen = Math.log(iMensal.plus(1).toNumber());
        const nCalculado = -lnNum / lnDen;

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
            { simbolo: 'n', nome: 'Prazo calculado (meses)', valor: String(n) },
            { simbolo: 'PV', nome: 'Valor Bruto', valor: fmtBRL(pv) },
            { simbolo: 'i', nome: 'Taxa de juros mensal', valor: taxaExibicao },
            { simbolo: 'PMT', nome: 'Parcela fixada', valor: fmtBRL(pmt) },
          ],
          passos: [
            `1. Calcular os juros do 1º mês: PV × i = ${fmtBRL(pv)} × ${iMensal.toString()} = ${fmtBRL(pv.times(iMensal))}`,
            `2. Dividir pela parcela: ${fmtNum(pv.times(iMensal))} / ${fmtNum(pmt)} = ${pv.times(iMensal).div(pmt).toFixed(6)} (fração da parcela consumida por juros no início)`,
            `3. Subtrair de 1: ${termoNum.toFixed(6)}`,
            `4. Logaritmo natural do resultado: ln(${termoNum.toFixed(6)}) = ${lnNum.toFixed(6)}`,
            `5. Logaritmo natural de (1 + i): ln(${iMensal.plus(1).toFixed(6)}) = ${lnDen.toFixed(6)}`,
            `6. Dividir e inverter o sinal: n = −(${lnNum.toFixed(6)} / ${lnDen.toFixed(6)}) = ${nCalculado.toFixed(2)}`,
            `7. Arredondar para o inteiro mais próximo: ${n} meses.`,
          ],
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
            `=NPER(${fmtNum(iPct, 4)}%; -${fmtNum(pmt)}; ${fmtNum(pv)})   → ${nCalculado.toFixed(2)} (valor fracionário exato)`,
            'Sintaxe: =NPER(taxa; -pgto; vp). Arredonde com =ARRED(...;0) para obter o prazo em meses inteiros.',
            NOTA_EXCEL_REGIONAL,
          ],
          normas: [NORMA_CDC_TRANSPARENCIA],
        };
      } else {
        // SAC
        const pmt1 = new Decimal(dados.parcelaCalculada);
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
            { simbolo: 'n', nome: 'Prazo calculado (meses)', valor: String(n) },
            { simbolo: 'PV', nome: 'Valor Bruto', valor: fmtBRL(pv) },
            { simbolo: 'A', nome: 'Amortização constante deduzida', valor: fmtBRL(amort) },
          ],
          passos: [
            `1. Deduzir os juros do 1º mês da primeira parcela: A = PMT₁ − PV × i = ${fmtBRL(pmt1)} − ${fmtBRL(pv.times(iMensal))} = ${fmtBRL(amort)}`,
            `2. Dividir o principal pela amortização: n = PV / A = ${fmtBRL(pv)} / ${fmtBRL(amort)} = ${pv.div(amort).toFixed(2)}`,
            `3. Arredondar para o inteiro de meses: ${n} meses.`,
          ],
          regras: [
            'O prazo é arredondado para um número inteiro contábil de parcelas.',
            'Se PMT₁ ≤ PV × i, a primeira parcela não cobre os juros — não existe prazo válido e o sistema rejeita.',
          ],
          hp12c: [
            'Cálculo aritmético:',
            `${fmtNum(pv)} ENTER ${fmtNum(iPct, 4)} %   → juros do 1º mês = ${fmtNum(pv.times(iMensal))}`,
            `${fmtNum(pmt1)} x><y −   → amortização A = ${fmtNum(amort)}`,
            `${fmtNum(pv)} x><y ÷   → n = ${pv.div(amort).toFixed(2)}`,
          ],
          excel: [
            `=${fmtNum(pv)}/(${fmtNum(pmt1)}-${fmtNum(pv)}*${fmtNum(iPct, 4)}%)   → ${pv.div(amort).toFixed(2)}`,
            NOTA_EXCEL_REGIONAL,
          ],
          normas: [NORMA_CDC_TRANSPARENCIA],
        };
      }
    }

    case 'valorLiquido': {
      const tarifa = new Decimal(resolvidos?.tarifaAbertura || '0');
      const iof = new Decimal(dados.iof || '0');
      const liq = pv.minus(tarifa).minus(iof);

      return {
        titulo: 'Valor Líquido Liberado',
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
        passos: [
          `1. Partir do valor bruto contratado: ${fmtBRL(pv)}`,
          `2. Subtrair a tarifa de abertura: ${fmtBRL(pv)} − ${fmtBRL(tarifa)} = ${fmtBRL(pv.minus(tarifa))}`,
          `3. Subtrair o IOF retido na liberação: ${fmtBRL(pv.minus(tarifa))} − ${fmtBRL(iof)} = ${fmtBRL(liq)}`,
        ],
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

      return {
        titulo: 'IOF Total (Imposto sobre Operações Financeiras)',
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
        passos: [
          `1. Somar o IOF diário de todas as parcelas (detalhado no card "IOF Diário"): ${fmtBRL(iofD)}`,
          `2. Calcular o IOF adicional fixo (detalhado no card "IOF Adicional"): ${fmtBRL(iofA)}`,
          `3. Somar as duas componentes: ${fmtBRL(iofD)} + ${fmtBRL(iofA)} = ${fmtBRL(iofT)}`,
        ],
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

      return {
        titulo: 'IOF Diário Acumulado',
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
        passos: [
          '1. Para cada parcela k, contar os dias corridos entre a data de liberação e o vencimento.',
          '2. Limitar a contagem ao teto legal: min(dias_k, 365).',
          `3. Multiplicar: amortização_k × ${aliquotaFracao} × dias limitados.`,
          `4. Somar todas as parcelas: IOF diário total = ${fmtBRL(iofD)}.`,
        ],
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

      return {
        titulo: 'IOF Adicional Fixo (0,38%)',
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
        passos: [
          `1. Multiplicar o principal pela alíquota fixa: ${fmtBRL(pv)} × 0,0038 = ${fmtBRL(pv.times('0.0038'))}`,
          `2. Arredondar para 2 casas: ${fmtBRL(iofA)}`,
        ],
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

      return {
        titulo: 'Total Pago pelo Cliente',
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
        passos: [
          '1. Somar o valor final de todas as parcelas do cronograma.',
          `2. Verificação de consistência: PV + juros = ${fmtBRL(pv)} + ${fmtBRL(totJuros)} = ${fmtBRL(pv.plus(totJuros))} ≈ ${fmtBRL(totPago)}.`,
        ],
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

      return {
        titulo: 'Total de Juros Acumulado',
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
        passos: [
          '1. Em cada período k, calcular juros_k = saldo devedor inicial × taxa mensal.',
          '2. Somar os juros de todas as parcelas do cronograma.',
          `3. Total apurado: ${fmtBRL(totJuros)} — equivale a ${fmtPct(totJuros.div(pv).times(100), 2)} do principal em termos nominais.`,
        ],
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

      return {
        titulo: topico === 'cetMensal' ? 'CET Mensal (Custo Efetivo Total)' : 'CET Anual (Custo Efetivo Total)',
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
        passos: [
          `1. Montar o fluxo de caixa: recebimento de ${fmtBRL(liq)} na data zero (líquido, não o bruto!) e os pagamentos de cada parcela nas datas de vencimento.`,
          '2. Converter cada prazo para a convenção BACEN: t_k = dias corridos / 365 (anos fracionários).',
          '3. Resolver numericamente (Newton-Raphson com fallback de bisseção) a taxa anual que iguala o valor presente dos pagamentos ao valor liberado.',
          `4. CET anual encontrado: ${fmtPct(cAnual.times(100), 2)}.`,
          `5. Converter para o mês por equivalência composta: CET_mensal = (1 + ${cAnual.toDecimalPlaces(6).toString()})^(1/12) − 1 = ${fmtPct(cMensal.times(100), 4)}.`,
        ],
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
      return {
        titulo: 'Prazo Final Pós-Eventos',
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
        passos: [
          '1. Aplicar cada evento (amortização extra, antecipação ou quitação) na ordem cronológica, abatendo o saldo devedor na data correspondente.',
          '2. Reprojetar o cronograma parcela a parcela: juros sobre o novo saldo, amortização conforme o sistema (Price ou SAC).',
          `3. Detectar a parcela em que o saldo devedor zera: parcela nº ${dados.resumo?.prazoFinal}.`,
        ],
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

      return {
        titulo: 'Economia de Juros Obtida',
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
        passos: [
          `1. Total de juros do cronograma base (sem eventos): ${fmtBRL(originalJ)}`,
          `2. Total de juros do cronograma reprojetado com os eventos: ${fmtBRL(novoJ)}`,
          `3. Diferença: ${fmtBRL(originalJ)} − ${fmtBRL(novoJ)} = ${fmtBRL(economia)}`,
        ],
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

      return {
        titulo: 'Amortizações Extras Totais',
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
        passos: [
          '1. Somar o valor de cada amortização extra aplicada ao saldo devedor.',
          '2. Nas antecipações, somar o valor presente das parcelas antecipadas (não o nominal).',
          `3. Total apurado: ${fmtBRL(extra)}.`,
        ],
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

      return {
        titulo: 'Mora e Multas de Atraso Acumuladas',
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
        passos: [
          '1. Para cada parcela em atraso, calcular a multa: parcela × percentual de multa (ex.: 2%).',
          '2. Calcular os juros de mora pro-rata: parcela × taxa mensal de mora × (dias de atraso / 30).',
          '3. Somar multa + mora de todos os atrasos.',
          `4. Total apurado: ${fmtBRL(encargos)}.`,
        ],
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

      return {
        titulo: 'Total Pago Pós-Eventos',
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
        passos: [
          '1. Somar todas as parcelas do cronograma reprojetado.',
          '2. Somar as amortizações extras e antecipações (pelo valor efetivamente pago).',
          '3. Somar multas e juros de mora de eventuais atrasos.',
          `4. Total desembolsado: ${fmtBRL(totalP)}.`,
        ],
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

      return {
        titulo: 'CET Mensal Pós-Eventos (fluxo realizado)',
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
        passos: [
          '1. Reconstituir o fluxo: valor liberado na data zero; cada pagamento (parcela, aporte, mora) na sua data real.',
          '2. Converter os prazos para dias corridos / 365 (convenção BACEN).',
          '3. Resolver a TIR numericamente (Newton-Raphson + bisseção).',
          `4. Resultado: ${fmtPct(cetM.times(100), 4)} ao mês.`,
        ],
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
