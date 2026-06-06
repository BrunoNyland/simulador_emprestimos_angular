# CALCULATION_REFERENCE — Fórmulas, Convenções e Exemplos

> Documento técnico de referência do **motor de cálculo**. Toda fórmula aqui
> deve ter um teste "golden" correspondente em `TEST_PLAN.md`. Valores de
> alíquotas/tarifas citados são **defaults de referência parametrizáveis** e
> devem ser confirmados contra o normativo vigente (ver `COMPLIANCE_NOTES.md`).

## 0. Princípio mestre: precisão decimal

JavaScript usa ponto flutuante IEEE-754 (`0.1 + 0.2 = 0.30000000000000004`).
**É proibido usar `number` nativo para qualquer valor monetário ou taxa.**

- Aritmética interna com **`decimal.js`** (ou `big.js`), precisão de **28–34
  dígitos significativos**.
- Arredondamento **configurável**, padrão **half-even (bancário / ROUND_HALF_EVEN)**;
  alternativa comercial (ROUND_HALF_UP).
- **Duas camadas de precisão**:
  - *Interna (cálculo):* alta precisão, sem arredondar entre etapas.
  - *Exibição/contábil:* arredonda para 2 casas (moeda) só na saída.
- **Resíduo de arredondamento** vai sempre para a **última parcela** (ajuste de
  centavos), garantindo `Σ amortizações = principal`.

## 1. Convenções de taxa

Sejam `i_m` (efetiva mensal), `i_a` (efetiva anual), `i_nom` (nominal anual).

| Conversão | Fórmula |
|---|---|
| Mensal → Anual (efetiva) | `i_a = (1 + i_m)^12 − 1` |
| Anual → Mensal (efetiva) | `i_m = (1 + i_a)^(1/12) − 1` |
| Nominal anual → mensal | `i_m = i_nom / 12` |
| Taxa do período irregular (pro-rata) | ver §6 |

### Convenções de contagem de dias (parametrizável)
- **30/360** (padrão comercial brasileiro para muitos produtos).
- **ACT/365** (dias corridos / ano de 365).
- **ACT/252** (dias úteis — comum em operações indexadas; exige calendário de
  feriados ANBIMA/B3).
- A convenção afeta o expoente `t_j` (em períodos-base) usado em CET, quitação e
  juros pro-rata.

## 2. Sistema Price (parcela constante / Tabela Price)

```
PMT = PV · i / (1 − (1 + i)^(−n))        (i ≠ 0)
PMT = PV / n                              (i = 0, caso-limite)
```
Iteração por parcela `k = 1..n`:
```
juros_k   = saldo_{k−1} · i
amort_k   = PMT − juros_k
saldo_k   = saldo_{k−1} − amort_k
```
- `saldo_0 = PV` (valor financiado / bruto).
- Última parcela: `amort_n = saldo_{n−1}`; `PMT_n = amort_n + juros_n` (absorve
  resíduo).
- **Edge:** se `PMT < juros_1` (parcela informada manualmente) → `amort_1 < 0` →
  saldo cresce (juros capitalizados / amortização negativa). Deve ser **detectado
  e sinalizado**, não silenciado.

## 3. Sistema SAC (amortização constante)

```
amort = PV / n                  (constante)
juros_k   = saldo_{k−1} · i
parcela_k = amort + juros_k     (+ encargos do período)
saldo_k   = saldo_{k−1} − amort
```
- Parcela **decrescente**.
- Resíduo de `PV/n` ajustado na última parcela.

### 3.1 SACRE (opcional / habitacional)
Mistura: parcela recalculada periodicamente; amortização cresce. Suportar como
modo adicional quando o produto habitacional exigir.

## 4. IOF — Imposto sobre Operações Financeiras (Decreto 6.306/2007)

> Defaults de referência — **parametrizáveis**, pois alíquotas foram alteradas em
> 2025 e podem mudar por decreto. Confirmar em `COMPLIANCE_NOTES.md`.

Componentes para operação de crédito parcelada:
```
IOF_diário  = Σ_k [ amort_principal_k · aliq_diaria · min(dias_k, 365) ]
IOF_adicional = principal · aliq_adicional         (fixo, default 0,38%)
IOF_total   = IOF_diário + IOF_adicional
```
- `aliq_diaria` default: **PF 0,0082%/dia**, **PJ 0,0041%/dia** (teto efetivo
  ~3% a.a. PF por causa do cap de 365 dias).
- `dias_k` = dias corridos da liberação até o vencimento da parcela `k`,
  **limitado a 365**.
- **IOF pode ser financiado** (somado ao bruto) **ou pago à vista** → impacta a
  relação bruto ↔ líquido (ver §7).
- **Isenções** (configurável por produto): financiamento habitacional (SFH),
  crédito rural, entre outros. Ver matriz de produtos.

## 5. CET — Custo Efetivo Total (Resolução CMN 4.881/2020)

O CET é a **taxa interna de retorno (TIR/IRR)** que iguala o **valor líquido
liberado ao cliente** ao valor presente de **todos** os desembolsos (parcelas +
tarifas + tributos + seguros + registro):

```
ValorLiberado = Σ_j  FC_j / (1 + CET_periodo)^(t_j)
```
- `t_j` = prazo até o fluxo `j`, em períodos-base (`dias_j / 30` para datas
  irregulares, ou `j` para periodicidade exata mensal).
- Anualização: `CET_anual = (1 + CET_periodo)^p − 1`, com `p` = períodos no ano
  (12 para mensal).
- **Solução numérica:** Newton-Raphson com **fallback por bisseção**; tolerância
  default `1e-10`; bracket inicial `[−0,9999 ; 10]`.
- **Componentes incluídos / excluídos** devem ser registrados (auditável). Nota:
  TAC é vedada para PF (Res. CMN 3.518/2007) — não incluir como default PF.

## 6. Período irregular / carência (juros pro-rata)

Quando o intervalo da 1ª parcela ≠ período padrão (ex.: carência, data-base
diferente do vencimento):
```
i_proporcional = (1 + i)^(dias_irregular / dias_periodo) − 1     (capitalização composta)
i_proporcional = i · (dias_irregular / dias_periodo)             (linear / simples, se exigido)
```
A escolha (composta vs linear) é **parametrizável** por produto.

## 7. Bruto, Líquido e Encargos (modelo de relação)

```
valor_liquido = valor_bruto − encargos_antecipados (deduzidos na liberação)
valor_bruto   = principal financiado (saldo_0)
```
- `encargos_antecipados` = subconjunto de {IOF, TAC/tarifa, seguro, registro}
  marcados como "deduzidos do líquido" (vs. "financiados no bruto").
- Cada encargo tem tipo: **fixo**, **percentual sobre principal**, **percentual
  a.p.**, **por período**, **único**.
- Alterar o líquido ⇒ resolver o bruto que, após deduzir encargos, gera aquele
  líquido (pode exigir solver se o encargo for % do bruto — dependência circular
  tratada em §8).

## 8. Solver / Recálculo bidirecional ("campo-alvo")

Variáveis da relação Price/SAC: `{ bruto/líquido, i, n, PMT }` ligadas por **1
equação**. Logo: **fixar 3 ⇒ resolver 1** (o *campo-alvo*).

- Campos **travados** (lock) + 1 **campo-alvo**; recálculo só altera o alvo.
- **Ordem topológica** para evitar ciclos (ex.: líquido → bruto via encargos →
  PMT). Detector de ciclo obrigatório.
- Alvos com fórmula fechada: `PMT`, `PV`, (`n` aproximado via log).
- Alvos sem fórmula fechada: **`i` (taxa)** → Newton + bisseção, mesma máquina do
  CET.
- Validar **sobre-restrição** (4 valores fixos inconsistentes) e
  **inviabilidade** (sem solução real) com mensagem clara.

## 9. Eventos pós-simulação

### 9.1 Quitação antecipada (Res. CMN 3.516/2007; art. 52 §2 CDC)
Redução **obrigatória** de juros futuros por **valor presente**:
```
saldo_quitação(d) = Σ_{j vincendas} parcela_j / (1 + i)^(t_j(d))
```
descontado à **taxa do contrato `i`** na data `d`. Para juros puros, equivale ao
saldo devedor contábil; com encargos embutidos, **não** equivale — calcular pelo
VP.

### 9.2 Amortização extra parcial
Aplica `valor` ao saldo presente; depois **duas opções**:
- (a) **Reduzir prazo**, mantendo a parcela.
- (b) **Reduzir parcela**, mantendo o prazo (recalcula PMT/SAC sobre novo saldo).

### 9.3 Antecipação de parcelas específicas
Traz parcelas futuras a valor presente (mesmo desconto da §9.1); remove-as do
cronograma e recompõe.

### 9.4 Pagamento efetivo
Registra pagamento (em dia, parcial, com atraso). Atraso ⇒ encargos de mora
(juros de mora + multa, parametrizáveis, default 1% a.m. + 2%). Recompõe saldo.

### 9.5 Cancelamento de evento
Eventos são uma **lista ordenada e imutável**; o cronograma é uma **projeção
determinística** dela. Cancelar = remover o evento e **reprojetar do zero** →
resultado reprodutível.

## 10. Desconto Bancário (produto distinto — desconto de títulos/duplicatas)

Não é empréstimo amortizável. Engine separado:
```
desconto_comercial = VN · d · n          ("por fora")
valor_liquido      = VN − desconto − tarifas − IOF
taxa_efetiva       = desconto / valor_liquido / n   (custo real > taxa de desconto)
```
`VN` = valor nominal do título, `d` = taxa de desconto ao período, `n` = períodos
até o vencimento.

## 11. Edge cases que o motor DEVE tratar

- Taxa zero (Price → PV/n); taxa negativa (rejeitar por default).
- `n = 1`; prazos longos (ex.: 420/600).
- Encargos > principal (líquido ≤ 0 → erro de viabilidade).
- Parcela < juros → amortização negativa (sinalizar).
- Resíduo de arredondamento (ajuste na última parcela; `Σ` fecha).
- 1ª parcela com carência / período irregular (pro-rata §6).
- Feriados / dias úteis (ACT/252 com calendário).
- Quitação no vencimento vs. entre vencimentos (pro-rata).
- Amortização que zera o saldo (= quitação implícita).
- Antecipar todas as vincendas = quitação total.
- Cancelar evento → cronograma idêntico ao anterior (determinismo).
- IOF: cap de 365 dias por parcela; produtos isentos.
