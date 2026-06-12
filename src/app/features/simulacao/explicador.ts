import { Decimal } from '../../core/engine/decimal.config';
import { SistemaAmortizacao } from '../../core/engine/models';
import { taxaEfetivaMensal } from '../../core/engine/rates';

export interface Explicacao {
  titulo: string;
  formula: string;
  descricao: string;
  legenda: { simbolo: string; nome: string; valor: string }[];
  passos: string[];
  regras: string[];
}

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
      ? "Arredondamento Bancário (Half-Even): Em caso de empate na terceira casa decimal, arredonda para o número par mais próximo (padrão contábil/financeiro)."
      : "Arredondamento Comercial (Half-Up): Em caso de empate (5), arredonda para cima.";

  const resolvidos = dados.parametros || dados.resolvidos;
  const pv = new Decimal(resolvidos?.valorBruto || '0');
  const iAnual = new Decimal(resolvidos?.taxa || '0');
  const n = Number(resolvidos?.prazo || '0');
  
  // Taxa periódica i (mensal)
  const iMensal = taxaEfetivaMensal(
    new Decimal(resolvidos?.taxa || '0'),
    resolvidos?.tipoTaxa || 'efetiva',
    resolvidos?.unidadeTaxa || 'mensal'
  );
  const taxaExibicao = fmtPct(iMensal.times(100), 4);

  switch (topico) {
    case 'parcela': {
      if (sistema === 'price') {
        const iVal = iMensal;
        const fatorJuros = iVal.plus(1); // 1 + i
        const fatorPotencia = fatorJuros.pow(-n); // (1+i)^-n
        const denom = new Decimal(1).minus(fatorPotencia); // 1 - (1+i)^-n
        const fatorAmort = denom.isZero() ? new Decimal(0) : iVal.div(denom);
        const pmtCalculado = pv.times(fatorAmort);

        return {
          titulo: 'Parcela (PMT) - Sistema Price',
          formula: 'PMT = PV * [ i / (1 - (1 + i)^-n) ]',
          descricao: 'No sistema Price (ou Tabela Price), as parcelas periódicas são constantes ao longo do tempo. O valor é calculado multiplicando o principal pelo fator de amortização clássico baseado em juros compostos.',
          legenda: [
            { simbolo: 'PMT', nome: 'Valor da Parcela Periódica', valor: fmtBRL(dados.parcelaCalculada) },
            { simbolo: 'PV', nome: 'Valor Bruto (Financiado)', valor: fmtBRL(pv) },
            { simbolo: 'i', nome: 'Taxa de Juros Efetiva do Período (Mensal)', valor: taxaExibicao },
            { simbolo: 'n', nome: 'Prazo total em meses', valor: String(n) }
          ],
          passos: [
            `1. Somar 1 à taxa de juros: 1 + i = 1 + ${iVal.toString()} = ${fatorJuros.toFixed(6)}`,
            `2. Calcular a potência inversa do prazo: (1 + i)^-n = (${fatorJuros.toFixed(6)})^-${n} = ${fatorPotencia.toFixed(6)}`,
            `3. Subtrair de 1: 1 - (1 + i)^-n = 1 - ${fatorPotencia.toFixed(6)} = ${denom.toFixed(6)}`,
            `4. Calcular o fator de amortização: i / Denominador = ${iVal.toString()} / ${denom.toFixed(6)} = ${fatorAmort.toFixed(6)}`,
            `5. Multiplicar pelo principal: PMT = R$ ${pv.toFixed(2)} * ${fatorAmort.toFixed(6)} = ${fmtBRL(pmtCalculado)}`,
            `6. Aplicar arredondamento contábil para duas casas decimais.`
          ],
          regras: [
            regraArredondamento,
            'O resíduo de centavos decorrente de dízimas ou arredondamentos é absorvido inteiramente na última parcela do cronograma, garantindo que o somatório exato das amortizações seja igual ao Valor Bruto inicial.'
          ]
        };
      } else {
        // SAC
        const amort = pv.div(n);
        const juros1 = pv.times(iMensal);
        const pmt1 = amort.plus(juros1);

        return {
          titulo: 'Primeira Parcela (PMT_1) - Sistema SAC',
          formula: 'PMT_k = A + J_k  (onde A = PV / n  e  J_k = Saldo_Devedor_{k-1} * i)',
          descricao: 'No Sistema de Amortização Constante (SAC), a cota de amortização do principal é igual e constante em todas as parcelas. Os juros decrescem a cada prestação, pois incidem sobre o saldo devedor restante. Portanto, as parcelas são decrescentes.',
          legenda: [
            { simbolo: 'PMT_1', nome: 'Primeira Parcela (PMT_1)', valor: fmtBRL(dados.parcelaCalculada) },
            { simbolo: 'A', nome: 'Amortização Constante Mensal', valor: fmtBRL(amort) },
            { simbolo: 'J_1', nome: 'Juros da primeira parcela', valor: fmtBRL(juros1) },
            { simbolo: 'PV', nome: 'Valor Bruto (Financiado)', valor: fmtBRL(pv) },
            { simbolo: 'i', nome: 'Taxa de Juros Mensal', valor: taxaExibicao },
            { simbolo: 'n', nome: 'Prazo total em meses', valor: String(n) }
          ],
          passos: [
            `1. Calcular a amortização de principal constante: A = PV / n = R$ ${pv.toFixed(2)} / ${n} = ${fmtBRL(amort)}`,
            `2. Calcular os juros da primeira parcela (sobre o saldo devedor inicial): J_1 = PV * i = R$ ${pv.toFixed(2)} * ${iMensal.toString()} = ${fmtBRL(juros1)}`,
            `3. Somar Amortização e Juros: PMT_1 = A + J_1 = R$ ${amort.toFixed(2)} + R$ ${juros1.toFixed(2)} = ${fmtBRL(pmt1)}`,
            `4. Para parcelas futuras (k > 1), o juro incide sobre o saldo devedor amortizado: Saldo_{k-1} = PV - A * (k - 1).`
          ],
          regras: [
            regraArredondamento,
            'O arredondamento da cota de amortização constante pode deixar resíduos. O motor do cálculo corrige os centavos na amortização da última parcela para liquidar perfeitamente o saldo devedor.'
          ]
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
        const pvCalculado = pmt.div(fatorAmort);

        return {
          titulo: 'Valor Bruto (PV) - Sistema Price',
          formula: 'PV = PMT / [ i / (1 - (1 + i)^-n) ]',
          descricao: 'Encontra o principal (Valor Bruto) que pode ser financiado para gerar uma parcela específica PMT.',
          legenda: [
            { simbolo: 'PV', nome: 'Valor Bruto (Financiado)', valor: fmtBRL(pv) },
            { simbolo: 'PMT', nome: 'Parcela Periódica Fixada', valor: fmtBRL(pmt) },
            { simbolo: 'i', nome: 'Taxa de Juros Mensal', valor: taxaExibicao },
            { simbolo: 'n', nome: 'Prazo em meses', valor: String(n) }
          ],
          passos: [
            `1. Somar 1 à taxa de juros: 1 + i = 1 + ${iVal.toString()} = ${fatorJuros.toFixed(6)}`,
            `2. Calcular o termo de potência: (1 + i)^-n = ${fatorPotencia.toFixed(6)}`,
            `3. Subtrair de 1: Denominador = ${denom.toFixed(6)}`,
            `4. Calcular o fator de amortização: Fator = i / Denominador = ${fatorAmort.toFixed(6)}`,
            `5. Dividir a parcela desejada pelo fator: PV = PMT / Fator = R$ ${pmt.toFixed(2)} / ${fatorAmort.toFixed(6)} = ${fmtBRL(pvCalculado)}`,
            `6. Aplicar arredondamento contábil.`
          ],
          regras: [
            regraArredondamento
          ]
        };
      } else {
        // SAC
        const pmt1 = new Decimal(dados.parcelaCalculada);
        const fator = new Decimal(1).div(n).plus(iMensal);
        const pvCalculado = pmt1.div(fator);

        return {
          titulo: 'Valor Bruto (PV) - Sistema SAC',
          formula: 'PV = PMT_1 / ( (1 / n) + i )',
          descricao: 'Encontra o principal (Valor Bruto) que gera uma primeira parcela específica PMT_1 no sistema SAC.',
          legenda: [
            { simbolo: 'PV', nome: 'Valor Bruto (Financiado)', valor: fmtBRL(pv) },
            { simbolo: 'PMT_1', nome: 'Primeira Parcela Fixada', valor: fmtBRL(pmt1) },
            { simbolo: 'i', nome: 'Taxa de Juros Mensal', valor: taxaExibicao },
            { simbolo: 'n', nome: 'Prazo em meses', valor: String(n) }
          ],
          passos: [
            `1. Calcular a cota proporcional de amortização: 1 / n = 1 / ${n} = ${new Decimal(1).div(n).toFixed(6)}`,
            `2. Somar à taxa de juros mensal: (1 / n) + i = ${new Decimal(1).div(n).toFixed(6)} + ${iMensal.toString()} = ${fator.toFixed(6)}`,
            `3. Dividir a primeira parcela pelo somatório: PV = PMT_1 / Fator = R$ ${pmt1.toFixed(2)} / ${fator.toFixed(6)} = ${fmtBRL(pvCalculado)}`
          ],
          regras: [
            regraArredondamento
          ]
        };
      }
    }

    case 'taxa': {
      return {
        titulo: 'Taxa de Juros (i) - Métodos Numéricos',
        formula: 'Resolver f(i) = PV - Σ [ PMT_k / (1 + i)^k ] = 0',
        descricao: 'Quando a Taxa de Juros é o campo resolvido, não há uma fórmula algébrica direta viável para prazos maiores que um mês. O sistema utiliza algoritmos iterativos numéricos de alta convergência para aproximar a taxa real que satisfaz a equivalência de fluxo de caixa.',
        legenda: [
          { simbolo: 'i', nome: 'Taxa mensal calculada', valor: taxaExibicao },
          { simbolo: 'PV', nome: 'Valor Bruto', valor: fmtBRL(pv) },
          { simbolo: 'PMT_k', nome: 'Desembolso da parcela k', valor: fmtBRL(dados.parcelaCalculada) },
          { simbolo: 'n', nome: 'Prazo', valor: String(n) }
        ],
        passos: [
          `1. Configurar a função f(i) que calcula o Valor Presente Líquido (VPL) das parcelas em relação ao principal PV.`,
          `2. Aplicar o Método de Newton-Raphson: i_{j+1} = i_j - [ f(i_j) / f'(i_j) ], partindo de um chute inicial aproximado.`,
          `3. Caso Newton-Raphson encontre derivada zero ou oscile, o motor chaveia para o método de Bisseção nos limites seguros da taxa.`,
          `4. A convergência é atingida quando a diferença de valor presente absoluta é menor que 1e-10 (tolerância regulatória).`,
          `5. A taxa obtida (${iMensal.toFixed(8)}) é convertida para exibição: ${taxaExibicao}.`
        ],
        regras: [
          'Tolerância de convergência parametrizada em "cet.toleranciaTir" no arquivo regulatory-config.jsonc.',
          'Se a taxa calculada for inviável ou negativa, o sistema bloqueia e emite um alerta informativo.'
        ]
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
          titulo: 'Prazo (n) - Sistema Price',
          formula: 'n = - ln( 1 - (PV * i) / PMT ) / ln( 1 + i )',
          descricao: 'Resolve a fórmula de juros compostos para isolar o número de períodos periódicos (n) necessários para liquidar o principal PV sob parcelas constantes PMT.',
          legenda: [
            { simbolo: 'n', nome: 'Prazo (meses)', valor: String(n) },
            { simbolo: 'PV', nome: 'Valor Bruto', valor: fmtBRL(pv) },
            { simbolo: 'i', nome: 'Taxa de Juros Mensal', valor: taxaExibicao },
            { simbolo: 'PMT', nome: 'Valor da Parcela Fixada', valor: fmtBRL(pmt) }
          ],
          passos: [
            `1. Calcular os juros nominais do período: PV * i = R$ ${pv.toFixed(2)} * ${iMensal.toString()} = R$ ${pv.times(iMensal).toFixed(2)}`,
            `2. Dividir pela parcela: Juros / PMT = ${pv.times(iMensal).toFixed(2)} / ${pmt.toFixed(2)} = ${pv.times(iMensal).div(pmt).toFixed(6)}`,
            `3. Subtrair de 1: 1 - Proporção = ${termoNum.toFixed(6)}`,
            `4. Extrair o logaritmo natural do numerador: ln(${termoNum.toFixed(6)}) = ${lnNum.toFixed(6)}`,
            `5. Extrair o logaritmo natural do denominador: ln(1 + i) = ln(${iMensal.plus(1).toFixed(6)}) = ${lnDen.toFixed(6)}`,
            `6. Dividir os resultados e inverter o sinal: n = -(${lnNum.toFixed(6)} / ${lnDen.toFixed(6)}) = ${nCalculado.toFixed(2)}`,
            `7. Arredondar para o prazo inteiro mais próximo: ${n} meses.`
          ],
          regras: [
            'O prazo deve ser um número inteiro positivo.',
            'Se PMT <= PV * i, os juros superam a parcela, resultando em amortização negativa perpétua. O sistema rejeita essa simulação e gera um erro de sobre-restrição.'
          ]
        };
      } else {
        // SAC
        const pmt1 = new Decimal(dados.parcelaCalculada);
        const amort = pmt1.minus(pv.times(iMensal));

        return {
          titulo: 'Prazo (n) - Sistema SAC',
          formula: 'n = PV / A  (onde A = PMT_1 - PV * i)',
          descricao: 'No sistema SAC, o prazo é a relação direta entre o valor bruto a financiar e a cota fixa de amortização mensal calculada a partir da primeira parcela.',
          legenda: [
            { simbolo: 'n', nome: 'Prazo (meses)', valor: String(n) },
            { simbolo: 'PV', nome: 'Valor Bruto', valor: fmtBRL(pv) },
            { simbolo: 'A', nome: 'Amortização Constante Obtida', valor: fmtBRL(amort) }
          ],
          passos: [
            `1. Calcular a amortização deduzindo os juros da primeira parcela: A = PMT_1 - PV * i = R$ ${pmt1.toFixed(2)} - R$ ${pv.times(iMensal).toFixed(2)} = ${fmtBRL(amort)}`,
            `2. Dividir o principal pela amortização: n = PV / A = R$ ${pv.toFixed(2)} / R$ ${amort.toFixed(2)} = ${n.toFixed(2)}`,
            `3. Arredondar para o valor inteiro de meses: ${n} meses.`
          ],
          regras: [
            'O prazo é arredondado para um número inteiro contábil de parcelas.'
          ]
        };
      }
    }

    case 'valorLiquido': {
      const tarifa = new Decimal(resolvidos?.tarifaAbertura || '0');
      const iof = new Decimal(dados.iof || '0');
      const liq = pv.minus(tarifa).minus(iof);

      return {
        titulo: 'Valor Líquido Liberado',
        formula: 'Líquido = Bruto - TarifaAbertura - IOF_total',
        descricao: 'O valor líquido creditado na conta do cliente equivale ao principal financiado (valor bruto) deduzido das taxas de originação (Tarifa de Abertura / TAC) e do imposto (IOF total) retidos na fonte.',
        legenda: [
          { simbolo: 'Líquido', nome: 'Valor Líquido Creditado', valor: fmtBRL(liq) },
          { simbolo: 'Bruto', nome: 'Valor Bruto Financiado (PV)', valor: fmtBRL(pv) },
          { simbolo: 'TarifaAbertura', nome: 'Tarifa de Originação (TAC)', valor: fmtBRL(tarifa) },
          { simbolo: 'IOF_total', nome: 'Tributo de IOF Retido', valor: fmtBRL(iof) }
        ],
        passos: [
          `1. Obter o valor bruto do empréstimo: R$ ${pv.toFixed(2)}`,
          `2. Subtrair a Tarifa de Abertura (se aplicável): R$ ${pv.toFixed(2)} - R$ ${tarifa.toFixed(2)} = R$ ${pv.minus(tarifa).toFixed(2)}`,
          `3. Subtrair o IOF total retido: R$ ${pv.minus(tarifa).toFixed(2)} - R$ ${iof.toFixed(2)} = R$ ${liq.toFixed(2)}`,
          `4. Arredondar para 2 casas decimais.`
        ],
        regras: [
          regraArredondamento,
          'Se o somatório das tarifas e tributos exceder o valor bruto financiado, a simulação se torna inviável (Líquido <= 0) e o sistema emitirá um aviso impeditivo.'
        ]
      };
    }

    case 'iof': {
      const iofD = new Decimal(dados.memoriaCalculo?.iofDiario || '0');
      const iofA = new Decimal(dados.memoriaCalculo?.iofAdicional || '0');
      const iofT = iofD.plus(iofA);

      return {
        titulo: 'IOF Total (Imposto sobre Operações Financeiras)',
        formula: 'IOF_total = IOF_diário + IOF_adicional',
        descricao: 'Conforme Decreto Federal nº 6.306/2007, o imposto sobre operação de crédito parcelada acumula duas parcelas: uma alíquota diária cobrada sobre o principal amortizado de cada prestação de acordo com seu prazo de vencimento (limitado a 365 dias), e um IOF adicional fixo incidente sobre o valor bruto.',
        legenda: [
          { simbolo: 'IOF_total', nome: 'Imposto Total Retido', valor: fmtBRL(iofT) },
          { simbolo: 'IOF_diário', nome: 'Soma do IOF Diário das Parcelas', valor: fmtBRL(iofD) },
          { simbolo: 'IOF_adicional', nome: 'IOF Fixo Adicional', valor: fmtBRL(iofA) }
        ],
        passos: [
          `1. Somar os juros/amortizações diárias calculadas individualmente por parcela: R$ ${iofD.toFixed(2)}`,
          `2. Obter a parcela do IOF Adicional Fixo: R$ ${iofA.toFixed(2)}`,
          `3. Somar os dois termos tributários: R$ ${iofD.toFixed(2)} + R$ ${iofA.toFixed(2)} = R$ ${iofT.toFixed(2)}`
        ],
        regras: [
          regraArredondamento,
          'Produtos imobiliários (habitacionais) são isentos de IOF por lei (SFH/regulação) — configurados como isentos no arquivo de compliance regulatório.'
        ]
      };
    }

    case 'iofDiario': {
      const iofD = new Decimal(dados.memoriaCalculo?.iofDiario || '0');

      return {
        titulo: 'IOF Diário Acumulado',
        formula: 'IOF_diário = Σ [ Amortização_k * Alíquota_diária * min(dias_k, 365) ]',
        descricao: 'Calcula a tributação diária proporcional incidente sobre o principal de cada parcela de amortização com base nos dias corridos entre a liberação e o vencimento.',
        legenda: [
          { simbolo: 'IOF_diário', nome: 'IOF Diário Acumulado', valor: fmtBRL(iofD) },
          { simbolo: 'Amortização_k', nome: 'Principal amortizado na parcela k', valor: 'Varia por parcela' },
          { simbolo: 'Alíquota_diária', nome: 'Alíquota diária (PF: 0,0082% / PJ: 0,0041%)', valor: resolvidos?.publico === 'PJ' ? '0,0041% ao dia' : '0,0082% ao dia' },
          { simbolo: 'dias_k', nome: 'Dias corridos até o vencimento da parcela k', valor: 'Varia por parcela' }
        ],
        passos: [
          '1. Para cada parcela k, calcular a distância em dias corridos da liberação até o vencimento da parcela.',
          '2. Limitar o número de dias ao teto legal de 365 dias (qualquer vencimento após 1 ano paga a taxa máxima equivalente a 365 dias).',
          `3. Multiplicar o valor de principal amortizado naquela parcela pelo número de dias (limitado a 365) e pela alíquota correspondente de ${resolvidos?.publico === 'PJ' ? '0.000041 (PJ)' : '0.000082 (PF)'}.`,
          `4. Acumular a soma de todas as parcelas para obter o IOF Diário Total: R$ ${iofD.toFixed(2)}.`
        ],
        regras: [
          'Teto de dias (365) e alíquotas definidas centralizadamente em regulatory-config.jsonc.',
          regraArredondamento
        ]
      };
    }

    case 'iofAdicional': {
      const iofA = new Decimal(dados.memoriaCalculo?.iofAdicional || '0');

      return {
        titulo: 'IOF Adicional Fixo',
        formula: 'IOF_adicional = PV * Alíquota_adicional',
        descricao: 'Calcula o tributo fixado de 0,38% incidente sobre o valor da liberação bruta de crédito no ato da originação, sem proporcionalidade de prazo.',
        legenda: [
          { simbolo: 'IOF_adicional', nome: 'IOF Adicional Fixo', valor: fmtBRL(iofA) },
          { simbolo: 'PV', nome: 'Valor Bruto do Crédito', valor: fmtBRL(pv) },
          { simbolo: 'Alíquota_adicional', nome: 'Taxa fixa adicional (0,38% ou 0,0038)', valor: '0,38%' }
        ],
        passos: [
          `1. Multiplicar o principal financiado pela alíquota fixa adicional: R$ ${pv.toFixed(2)} * 0,0038 = R$ ${pv.times(0.0038).toFixed(2)}`,
          `2. Aplicar o arredondamento contábil para fechar o valor do tributo: R$ ${iofA.toFixed(2)}.`
        ],
        regras: [
          regraArredondamento
        ]
      };
    }

    case 'totalPago': {
      const totPago = new Decimal(dados.totais?.totalParcelas || '0');

      return {
        titulo: 'Total Pago pelo Cliente',
        formula: 'Total Pago = Σ PMT_k',
        descricao: 'Corresponde à soma simples do desembolso de todas as prestações periódicas de repagamento (amortizações + juros) da simulação regular base.',
        legenda: [
          { simbolo: 'Total Pago', nome: 'Soma nominal desembolsada', valor: fmtBRL(totPago) },
          { simbolo: 'PMT_k', nome: 'Valor final de cada prestação k', valor: 'Varia por parcela' }
        ],
        passos: [
          '1. Acumular o valor final de todas as parcelas mensais simuladas.',
          `2. A soma nominal fechou em: ${fmtBRL(totPago)}.`
        ],
        regras: [
          'A última parcela absorve os desvios de arredondamento decimais acumulados.'
        ]
      };
    }

    case 'totalJuros': {
      const totJuros = new Decimal(dados.totais?.totalJuros || '0');

      return {
        titulo: 'Total de Juros Acumulado',
        formula: 'Total Juros = Σ Juros_k',
        descricao: 'Acumula a receita de juros gerada e cobrada mensalmente ao longo de todo o prazo sobre o saldo devedor pendente.',
        legenda: [
          { simbolo: 'Total Juros', nome: 'Soma total de juros incidentes', valor: fmtBRL(totJuros) }
        ],
        passos: [
          '1. Em cada período, os juros da parcela são calculados aplicando a taxa sobre o saldo devedor inicial daquele período.',
          `2. O somatório de todos os encargos de juros fechou em: R$ ${totJuros.toFixed(2)}.`
        ],
        regras: [
          regraArredondamento
        ]
      };
    }

    case 'cetMensal':
    case 'cetAnual': {
      const cMensal = new Decimal(dados.cetMensal || '0');
      const cAnual = new Decimal(dados.cetAnual || '0');

      return {
        titulo: topico === 'cetMensal' ? 'CET Mensal (Custo Efetivo Total)' : 'CET Anual (Custo Efetivo Total)',
        formula: 'Líquido = Σ [ PMT_k / (1 + CET_mensal)^t_k ]  e  CET_anual = (1 + CET_mensal)^12 - 1',
        descricao: 'O Custo Efetivo Total (CET) expressa as despesas totais da operação como uma taxa percentual periódica e anualizada. Ele é obtido calculando a Taxa Interna de Retorno (TIR) que iguala o fluxo de caixa de desembolso futuro de prestações (despesas de parcelas) ao valor líquido efetivamente entregue (liberado) ao tomador do crédito na data inicial.',
        legenda: [
          { simbolo: 'Líquido', nome: 'Valor Efetivamente Liberado', valor: fmtBRL(dados.valorLiquido) },
          { simbolo: 'PMT_k', nome: 'Fluxo de desembolsos futuros (parcela k)', valor: 'Varia por parcela' },
          { simbolo: 't_k', nome: 'Fração do prazo (dias corridos / 365)', valor: 'Varia por parcela' },
          { simbolo: 'CET_mensal', nome: 'Taxa periódica resolvida', valor: fmtPct(cMensal.times(100), 4) },
          { simbolo: 'CET_anual', nome: 'Taxa anualizada obtida', valor: fmtPct(cAnual.times(100), 2) }
        ],
        passos: [
          `1. Mapear o fluxo de caixa: entrada positiva no tempo zero de R$ ${new Decimal(dados.valorLiquido).toFixed(2)}, seguida por parcelas de pagamento negativas nas respectivas datas de vencimento.`,
          `2. O algoritmo numérico busca a taxa periódica mensal (CET_mensal) que zera a soma das parcelas descontadas pelas frações de dias reais divididas por 365 dias (Normativa de contagem do Banco Central).`,
          `3. Resolver numericamente: CET Mensal = ${fmtPct(cMensal.times(100), 4)}.`,
          `4. Anualizar a taxa resolvida através da capitalização composta: CET Anual = (1 + CET_mensal)^12 - 1 = (1 + ${cMensal.toString()})^12 - 1 = ${fmtPct(cAnual.times(100), 2)}.`
        ],
        regras: [
          'Resolvido com tolerância menor que 1e-10 conforme regulatory-config.jsonc.',
          'Inclui a tarifa de abertura de crédito (se cobrada) e a despesa do IOF retido na base de cálculo.'
        ]
      };
    }

    // --- PÓS-EVENTOS ---
    case 'prazoFinal': {
      return {
        titulo: 'Prazo Final Pós-Eventos',
        formula: 'Prazo Novo = n - Parcelas_Eliminadas',
        descricao: 'Mostra o prazo final atualizado em meses da operação após amortizações extraordinárias aplicadas com a opção de reduzir prazo.',
        legenda: [
          { simbolo: 'Prazo Novo', nome: 'Novo prazo final recalculado', valor: `${dados.resumo?.prazoFinal} meses` }
        ],
        passos: [
          '1. Quando são feitos pagamentos extras sob a opção "reduzir-prazo", o saldo devedor diminui aceleradamente.',
          '2. O motor recalcula o cronograma e detecta em qual parcela o saldo devedor principal foi reduzido a zero (amortização integral).',
          `3. A última parcela ativa no novo cronograma passou a ser a parcela nº ${dados.resumo?.prazoFinal}.`
        ],
        regras: [
          'A amortização que zera o saldo devedor encerra o contrato imediatamente.'
        ]
      };
    }

    case 'economiaJuros': {
      const originalJ = new Decimal(dados.totaisOriginal?.totalJuros || '0');
      const novoJ = new Decimal(dados.totais?.totalJuros || '0');
      const economia = new Decimal(dados.resumo?.economiaJuros || '0');

      return {
        titulo: 'Economia de Juros Obtida',
        formula: 'Economia = Juros_Base - Novo_Total_Juros',
        descricao: 'Calcula o somatório de encargos de juros poupados pelo tomador do empréstimo em virtude das amortizações extras e pagamentos antecipados feitos, que reduziram a base de saldo devedor principal.',
        legenda: [
          { simbolo: 'Economia', nome: 'Juros economizados', valor: fmtBRL(economia) },
          { simbolo: 'Juros_Base', nome: 'Total de juros na simulação original', valor: fmtBRL(originalJ) },
          { simbolo: 'Novo_Total_Juros', nome: 'Total de juros após os eventos', valor: fmtBRL(novoJ) }
        ],
        passos: [
          `1. Resgatar o total de juros simulados originalmente: R$ ${originalJ.toFixed(2)}`,
          `2. Resgatar o total de juros incorridos no cronograma com eventos: R$ ${novoJ.toFixed(2)}`,
          `3. Subtrair os termos: Economia = R$ ${originalJ.toFixed(2)} - R$ ${novoJ.toFixed(2)} = R$ ${economia.toFixed(2)}`
        ],
        regras: [
          regraArredondamento
        ]
      };
    }

    case 'amortizacoesExtras': {
      const extra = new Decimal(dados.resumo?.amortizacoesExtras || '0');

      return {
        titulo: 'Amortizações Extras Totais',
        formula: 'Amortizações Extras = Σ Aportes_Adicionais',
        descricao: 'Acumula todas as cotas voluntárias pagas extraordinariamente pelo cliente para reduzir diretamente o saldo principal da dívida.',
        legenda: [
          { simbolo: 'Amortizações Extras', nome: 'Total amortizado de forma avulsa', valor: fmtBRL(extra) }
        ],
        passos: [
          `1. Somar o valor nominal de cada amortização extra ou amortização via antecipação declarada na lista de eventos: R$ ${extra.toFixed(2)}.`
        ],
        regras: [
          'Reduzem o saldo devedor de forma imediata na data de ocorrência do evento.'
        ]
      };
    }

    case 'moraEncargos': {
      const encargos = new Decimal(dados.resumo?.totalEncargos || '0');

      return {
        titulo: 'Mora e Multas de Atraso Acumuladas',
        formula: 'Encargos = Σ [ Parcela * i_mora * (dias_atraso/30) ] + Σ [ Parcela * Multa_atraso ]',
        descricao: 'Se houver pagamentos efetuados com atraso de dias corridos, incidem juros moratórios calculados pro-rata dia pela taxa mensal legal/configurada mais multa contratual por atraso de pagamento.',
        legenda: [
          { simbolo: 'Encargos', nome: 'Total de penalidades financeiras pagas', valor: fmtBRL(encargos) }
        ],
        passos: [
          '1. Para cada evento de pagamento em atraso, calcular a multa (ex: 2% sobre o valor da parcela vencida).',
          '2. Calcular os juros de mora acumulados correspondentes aos dias em atraso (pro-rata dias da taxa mensal).',
          '3. Somar os dois encargos punitivos.',
          `4. O total apurado em penalidades foi de: R$ ${encargos.toFixed(2)}.`
        ],
        regras: [
          'Juros de mora e multa limitados aos tetos previstos em regulatory-config.jsonc.',
          regraArredondamento
        ]
      };
    }

    case 'totalPagoPos': {
      const totalP = new Decimal(dados.totais?.totalParcelas || '0');

      return {
        titulo: 'Total Pago Pós-Eventos',
        formula: 'Total Pago = Σ ParcelasRecalculadas + AmortizaçõesExtras + EncargosMora',
        descricao: 'Acumula todas as saídas de caixa ocorridas ao longo do cronograma revisado pelos eventos do usuário.',
        legenda: [
          { simbolo: 'Total Pago', nome: 'Desembolso total acumulado', valor: fmtBRL(totalP) }
        ],
        passos: [
          '1. Acumular todas as prestações regulares pagas (que foram amortecidas pelo recálculo).',
          '2. Somar todos os aportes extras de amortização e penalidades de mora.',
          `3. Total desembolsado pelo cliente: ${fmtBRL(totalP)}.`
        ],
        regras: [
          regraArredondamento
        ]
      };
    }

    case 'cetMensalPos': {
      const cetM = new Decimal(dados.cetMensal || '0');

      return {
        titulo: 'CET Mensal Pós-Eventos',
        formula: 'Resolver TIR do novo fluxo de caixa real',
        descricao: 'Calcula o custo efetivo real recalculado sobre a operação, levando em conta todas as datas de amortizações e juros extras incorridos.',
        legenda: [
          { simbolo: 'CET Mensal', nome: 'Taxa real recalculada', valor: fmtPct(cetM.times(100), 4) }
        ],
        passos: [
          `1. Reconstituir o fluxo de caixa incluindo o valor líquido inicial (positivo) e todos os novos pagamentos (negativos) nas datas reais dos eventos.`,
          `2. Resolver numericamente a taxa interna de retorno com base na regra de contagem de dias reais/365.`,
          `3. Resultado obtido: ${fmtPct(cetM.times(100), 4)}.`
        ],
        regras: [
          'Usa solver numérico de precisão decimal configurado.'
        ]
      };
    }

    default:
      return null;
  }
}
