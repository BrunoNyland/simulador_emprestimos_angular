# Fase 2 — Passo a Passo da Implementação (Motor de Cálculo)

> Núcleo da precisão bancária. Tudo em TypeScript puro (sem Angular), em
> `src/app/core/engine/` (+ loader em `src/app/core/products/`), coberto por
> golden tests (Vitest). Ver CALCULATION_REFERENCE.md e TEST_PLAN.md.

## Módulos implementados

| Módulo | Arquivo | Conteúdo |
|---|---|---|
| Datas | `engine/dates.ts` | dias corridos, adicionar meses (ajuste fim de mês) |
| Taxas | `engine/rates.ts` | conversões mensal↔anual, nominal/efetiva, período irregular (composta/linear) |
| Price | `engine/price.ts` | PMT, cronograma, taxa zero, resíduo na última parcela |
| SAC | `engine/sac.ts` | amortização constante, parcela decrescente, resíduo |
| Totais | `engine/totais.ts` | soma de juros/amortização/encargos/parcelas |
| Encargos | `engine/encargos.ts` | bruto↔líquido (inclui relação circular % do bruto) |
| IOF | `engine/iof.ts` | diário (cap 365) + adicional + isenção (Decreto 6.306/2007) |
| CET | `engine/cet.ts` | TIR via Newton-Raphson + fallback bisseção (Res. 4.881/2020) |
| Solver | `engine/solver.ts` | campo-alvo Price {PV, i, n, parcela} ("fixar 3, resolver 1") |
| Config | `products/regulatory-config.ts` | parse JSONC (strip comments) + resolução de IOF |

## Decisões de precisão
- Tudo em `Decimal` (34 dígitos); arredondamento **half-even** na saída monetária.
- Cronogramas: juros/amortização em 2 casas; **última parcela absorve o resíduo**
  (Σ amortização = principal, exato).
- Datas em UTC para evitar drift de fuso.

## Escopo / limites desta fase
- Solver inverso implementado para **Price**; para **SAC** o cronograma é gerado,
  mas o solver inverso fica para fase posterior.
- `valorLiquido ↔ valorBruto` é resolvido por `encargos.ts` (atende o exemplo do
  cliente: alterar líquido recalcula bruto); a integração no fluxo de UI vem na
  Fase 3.
- Eventos pós-simulação (amortização extra, quitação, antecipação) são da Fase 4.

## Verificação
- Testes: **38 passando** (11 arquivos) — `ng test --watch=false`.
- Build de produção: OK — `ng build`.
- Dependências adicionadas: `@types/node` (devDep, para teste que lê o JSONC real).

## Casos golden cobertos (ver TEST_PLAN.md)
- Price PV=1000/i=1%/n=12 → PMT 88,85; Σ amort 1000,00.
- SAC mesma entrada → amort 83,33 (última 83,37); parcela 1 = 93,33.
- IOF PF bullet 1000/30d → 6,26; cap de 365 dias; isento → 0.
- CET: 1000→1100 em t=1 → 10% a.m. (213,84% a.a.); round-trip Price → 1%.
- Solver: parcela/PV/prazo/taxa coerentes (round-trip).
- Encargos: round-trip fixo e percentual; rejeita ≥100%.
- Loader JSONC: remove comentários sem quebrar URLs; parseia o arquivo real.

## Próximo passo (Fase 3)
UI base: Reactive Forms com campo-alvo/locks, tabela de parcelas, recálculo
reativo (signals) e comparativo Price vs SAC, ligando ao motor desta fase.
