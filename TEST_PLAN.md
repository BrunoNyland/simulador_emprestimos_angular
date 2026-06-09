# TEST_PLAN — Estratégia de Testes e Casos de Referência

> Garante a "precisão bancária": cada fórmula do `CALCULATION_REFERENCE.md` tem
> teste correspondente. Runner: **Vitest** (`npm test` / `ng test --watch=false`).

## 1. Tipos de teste
- **Unitários do motor** (TS puro, sem Angular): rates, price, sac, encargos, iof,
  cet, solver, dates, loader de config.
- **Golden tests**: valores de referência conferidos manualmente / por planilha.
- **Round-trip**: ex. `pmt → pv → pmt`, `cet(price(i)) ≈ i`.
- **Edge cases** (CALC_REF §11).

## 2. Casos golden (referência)

### Price — PV=1000, i=1% a.m., n=12
- PMT ≈ **88,85** (exato 88,848788…).
- Σ amortização = **1000,00**; saldo final = **0,00**.
- Última parcela absorve resíduo.

### SAC — PV=1000, i=1% a.m., n=12
- Amortização constante = **83,33** (última absorve resíduo p/ fechar 1000,00).
- Parcela 1 = amort + juros = 83,33 + 10,00 = **93,33**.
- Parcela decrescente; saldo final = **0,00**.

### IOF — PF, principal=1000, bullet 30 dias
- Diário = 1000 × 0,000082 × 30 = **2,46**.
- Adicional = 1000 × 0,0038 = **3,80**.
- Total = **6,26**.

### CET
- Liberado=1000, 1 pgto de 1100 em t=1 → CET mensal = **10%**; anual = (1,1)¹²−1 ≈ **213,84%**.
- Round-trip: CET de uma série Price com i=1% ≈ **1%** (dentro da tolerância).

### Solver (relação Price {PV, i, n, PMT})
- alvo=parcela: PV=1000, i=1%, n=12 → PMT ≈ 88,85.
- alvo=PV: PMT, i=1%, n=12 → PV ≈ 1000.
- alvo=prazo: PV=1000, PMT, i=1% → n = 12.
- alvo=taxa: PV=1000, PMT, n=12 → i ≈ 1%.

### Encargos (bruto ↔ líquido)
- Encargo fixo 50 deduzido: bruto 1000 → líquido 950; líquido 950 → bruto 1000.
- Encargo % do principal (circular): líquido → bruto = (líquido+fixo)/(1−%).

## 3. Edge cases cobertos
- Taxa zero (Price → PV/n).
- n=1 e prazos longos.
- Resíduo de arredondamento (somatórios fecham).
- Datas: dias corridos, fim de mês (31 jan +1 mês → 28/29 fev).
- IOF: cap de 365 dias; produto isento → 0.
- Loader JSONC: remove `//` e `/* */` sem quebrar URLs em strings.

## 4. Status
- Fase 2: cobertura inicial do motor (este documento evolui com novos casos).
- Pendente cliente: planilhas oficiais para ampliar os golden tests.
