# Especificação — Simulador de Empréstimo (Angular, Front-end only)

## 1. Objetivo

Simulador de empréstimo com **precisão bancária**, 100% no front-end, capaz de:
- calcular e exibir cronogramas em **Price** e **SAC** (e SACRE/desconto bancário
  quando o produto exigir);
- **recalcular dinamicamente** a partir de qualquer parâmetro (campo-alvo/solver);
- calcular **CET** e **IOF** conforme referência BACEN;
- simular **eventos pós-contratação** (amortização, pagamento, quitação
  antecipada, antecipação de parcelas);
- **exportar** em Excel (.xlsx) e PDF;
- suportar múltiplos **produtos** (PF/PJ) via presets configuráveis.

Documentos irmãos: `CALCULATION_REFERENCE.md` (fórmulas), `COMPLIANCE_NOTES.md`
(normativos e matriz de produtos), `ARCHITECTURE.md` (stack e camadas),
`ROADMAP.md` (execução).

## 2. Requisitos não-negociáveis ("precisão bancária")

1. **Sem `number` nativo para dinheiro/taxa.** Aritmética com `decimal.js`,
   28–34 dígitos, arredondamento **half-even** default (ver CALC_REF §0).
2. **Resíduo de arredondamento** absorvido na última parcela; somatórios fecham.
3. **Motor de cálculo é TS puro**, isolado de Angular, testável e auditável.
4. **Determinismo:** mesmo input ⇒ mesmo output, sempre; cronograma é projeção
   determinística de `params + eventos`.
5. **Rastreabilidade:** versão do motor + versão da config regulatória + hash em
   cada simulação e export.

## 3. Conformidade BACEN (parametrizável e validável)

- Alíquotas, tetos e textos **não são hard-coded**: vivem em
  `data/regulatory-config.json` (versionado, com data de vigência).
- CET por **TIR** (Res. CMN 4.881/2020); quitação com **redução obrigatória de
  juros por valor presente** (Res. CMN 3.516/2007; CDC art. 52 §2); IOF
  (Decreto 6.306/2007) PF/PJ + adicional, cap de 365 dias, isenções por produto.
- Disclaimers de "simulação" no app e nos exports.
- Pendências jurídicas listadas em `COMPLIANCE_NOTES.md` (§4) — bloqueiam
  produção, não o MVP.

## 4. Escopo funcional

### 4.1 Simulação inicial
- **Sistemas:** Price, SAC (SACRE e desconto bancário por produto).
- **Entradas:** produto/preset, público (PF/PJ), valor bruto, valor líquido,
  taxa (mensal/anual, nominal/efetiva), prazo, periodicidade, data-base e datas
  de vencimento, encargos (IOF, tarifas, seguros, registro), indexador (quando
  aplicável).
- **Saídas:** tabela de parcelas (saldo inicial, juros, amortização, encargos,
  parcela, saldo final), totais, **CET** (mensal e anual), total de juros, total
  de IOF, total pago.

### 4.2 Edição e recálculo dinâmico (campo-alvo / solver)
- Editáveis: bruto, líquido, parcela, taxa, prazo, encargos.
- Modelo: relação Price/SAC liga `{bruto/líquido, i, n, PMT}` por 1 equação ⇒
  **fixar 3, resolver 1** (o campo-alvo). Campos podem ser **travados** (lock).
- Exemplos exigidos pelo cliente:
  - altero **líquido** ⇒ recalcula **bruto** (via encargos) **e parcelas**;
  - altero **parcela** ⇒ resolve **taxa** (ou prazo) conforme campo-alvo.
- Solver numérico (Newton + bisseção) com tolerância/limites configuráveis;
  detecção de **ciclo**, **sobre-restrição** e **inviabilidade** (ver CALC_REF §8).

### 4.3 Pós-simulação
- **Amortização extra parcial:** (a) reduzir prazo mantendo parcela; (b) reduzir
  parcela mantendo prazo.
- **Quitação antecipada:** saldo = valor presente das vincendas à taxa do
  contrato, na data escolhida (no vencimento ou pro-rata entre vencimentos).
- **Antecipação de parcelas específicas:** traz a VP e remove do cronograma.
- **Pagamento efetivo:** em dia / parcial / em atraso (mora parametrizável);
  recompõe saldo e cronograma.
- **Cancelamento de evento:** reprojeção determinística (eventos = lista
  ordenada; cronograma = projeção).

### 4.4 Exportação
- **Excel (.xlsx)** via `exceljs`: parâmetros + tabela de parcelas + totais + CET.
- **PDF** via `pdfmake`: resumo + cronograma + disclaimers.
- Ambos com metadata: data/hora, versão do motor, **hash** da simulação.
- 100% client-side.

### 4.5 Comparativo
- Price vs SAC lado a lado (totais, CET, evolução do saldo).

## 5. Modelo de dados (alto nível)

- **Simulação:** id, dataBase, produto/preset, público, sistema, periodicidade,
  params (bruto, líquido, taxa, prazo), encargos[], indexador, regras
  (arredondamento, dayCount, políticaRecalculo), resultados (totais, CET, tabela),
  engineVersion, regConfigVersion, hash.
- **Parcela:** numero, dataVencimento, saldoInicial, juros, amortizacao,
  encargos, valorParcela, saldoFinal.
- **Evento:** tipo (amortizacao | pagamento | quitacao | antecipacao), data,
  valor, opções (reduzPrazo|reduzParcela), regrasAplicadas.
- **Encargo:** nome, tipo (fixo|%principal|%a.p.|porPeríodo|único), valor/base,
  incidência, deduzidoDoLíquido | financiadoNoBruto.

## 6. Regras de cálculo
Definidas em detalhe em `CALCULATION_REFERENCE.md`: conversões de taxa, day-count,
Price, SAC/SACRE, IOF, CET (TIR), período irregular/carência, bruto↔líquido,
solver, eventos, desconto bancário, arredondamento.

## 7. Edge cases (mínimo obrigatório)
Taxa zero; taxa negativa (rejeitar); n=1 e prazos longos (≤600); encargos >
principal; parcela < juros (amortização negativa, sinalizar); resíduo de
arredondamento; 1ª parcela com carência (pro-rata); dias úteis (ACT/252);
quitação entre vencimentos; amortização que zera saldo; antecipar todas =
quitação; cancelar evento (determinismo); IOF cap 365 dias e produtos isentos.
(Detalhe em CALC_REF §11.)

## 8. UX e validações
- Reactive Forms com validação imediata; locale pt-BR (moeda/datas).
- Indicação visual de **campo-alvo** e **campos travados**.
- Tabela com totais em destaque, filtros e (opc.) gráfico de saldo devedor.
- Mensagens claras para entradas inválidas/inviáveis.
- Disclaimer de simulação visível.

## 9. Persistência e auditoria (sem backend)
- IndexedDB para salvar/listar simulações; import/export JSON.
- Logs de cálculo (parâmetros, regras, versões); hash por simulação.

## 10. Qualidade e testes
- **Golden tests** do motor (Price/SAC, IOF, CET, solver, eventos) validados
  contra planilhas de referência (`data/golden/`).
- Regressão, testes de exportação (layout + valores), e2e dos fluxos principais.

## 11. Não-objetivos (por enquanto)
Integração com sistemas bancários reais; originação/contratação efetiva; KYC.

## 12. Pendências
Ver `COMPLIANCE_NOTES.md` §4 (alíquotas vigentes, tetos por convênio,
componentes de CET por produto, textos de disclosure).
