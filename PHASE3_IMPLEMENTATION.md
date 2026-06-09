# Fase 3 — Passo a Passo da Implementação (UI base)

> Liga a UI ao motor da Fase 2: formulário reativo com campo-alvo/locks, tabela
> de parcelas, recálculo reativo (signals), CET e comparativo Price × SAC.

## O que foi implementado

| Item | Arquivo |
|---|---|
| Store (signals + orquestração do motor) | `features/simulacao/simulacao.store.ts` |
| Componente Simulador (Reactive Forms + tabela) | `features/simulacao/simulador.component.{ts,html,scss}` |
| Rotas (`''` → Simulador) | `app/app.routes.ts` |
| Shell/header da app | `app/app.html`, `src/styles.scss` |

## Como funciona o recálculo reativo
- `SimulacaoStore` mantém os parâmetros em **signals**; `resultado` é um
  `computed` que chama o motor (solver → cronograma → totais → CET) e devolve
  `{ tipo: 'ok' | 'erro' }`.
- O componente usa **Reactive Forms**; `valueChanges` atualiza os signals, e um
  `effect` reflete o **valor resolvido** de volta no campo-alvo (read-only).
- **Campo-alvo / locks (Price):** o campo escolhido (parcela, valor bruto, taxa
  ou prazo) fica travado e é **calculado**; os demais são editáveis. Ex.: alterar
  a parcela com alvo=taxa recalcula a taxa.
- **SAC:** cronograma gerado direto de {valor bruto, taxa, prazo}; a parcela
  vira informativa (1ª parcela), pois varia.

## Recursos da tela
- Cartões de resumo: parcela, total pago, total de juros, **CET mensal e anual**.
- Tabela de parcelas com saldo, juros, amortização, parcela e saldo final + totais.
- **Comparativo Price × SAC** (1ª/última parcela, juros, total pago).
- Locale **pt-BR** (R$ via CurrencyPipe; % via PercentPipe).
- Disclaimer de simulação.

## Verificação
- Testes: **42 passando** (12 arquivos) — inclui 4 testes do store
  (`simulacao.store.spec.ts`) cobrindo Price (campo-alvo parcela/valorBruto),
  SAC e estado de erro.
- Build de produção: OK (`ng build`, ~325 kB).
- Dev server: OK (HTTP 200, `<app-root>` presente).

## Escopo / limites desta fase
- CET é calculado a partir do fluxo das parcelas (liberado = valor bruto), **sem
  IOF/encargos** ainda — entram quando o painel de encargos for ligado (a relação
  bruto↔líquido já existe em `encargos.ts`).
- Campo-alvo completo apenas no **Price** (limite herdado do solver da Fase 2).
- Sem persistência/exportação ainda (Fases 5 e 7).

## Próximo passo (Fase 4)
Eventos pós-simulação: amortização extra (reduzir prazo/parcela), quitação
antecipada (valor presente), antecipação de parcelas e pagamento efetivo,
recompondo o cronograma de forma determinística.
