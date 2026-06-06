# ARCHITECTURE — Arquitetura (Front-end only)

> Toda a aplicação roda **100% no navegador**. Não há backend: nenhum cálculo,
> persistência ou exportação depende de servidor.

## 1. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | **Angular 17+** (standalone components, signals, `@if/@for`) | Pedido do cliente; reatividade fina via signals |
| Aritmética | **decimal.js** | Precisão bancária; `number` nativo é proibido (ver CALCULATION_REFERENCE §0) |
| Estado | **Signals** + serviços (store leve) | Sem boilerplate; recálculo reativo |
| Formulários | **Reactive Forms** | Validação imediata, campo-alvo/locks |
| Persistência | **IndexedDB** (lib `idb`) + export/import JSON | Salvar simulações localmente, sem servidor |
| Export Excel | **exceljs** (client-side) | `.xlsx` no browser, com formatação |
| Export PDF | **pdfmake** (client-side) | PDF declarativo no browser |
| Cálculo pesado | **Web Worker** | Solver/CET/cronogramas longos sem travar a UI |
| Gráficos (opc.) | lib leve (ex.: Chart.js) | Evolução do saldo devedor |
| Testes | Jest/Vitest (unit) + Playwright (e2e opc.) | Golden tests do motor |

## 2. Camadas (dependência aponta para dentro)

```
┌─────────────────────────────────────────────┐
│  UI (Angular components, standalone)         │  formulários, tabelas, gráficos
├─────────────────────────────────────────────┤
│  Application (serviços/signals, store)       │  orquestra casos de uso, persistência
├─────────────────────────────────────────────┤
│  Domain / Engine (TS puro, SEM Angular)      │  Price, SAC, IOF, CET, solver, eventos
└─────────────────────────────────────────────┘
```

### Regra de ouro
O **motor de cálculo** (`/core` ou lib `engine`) é **TypeScript puro**, sem
nenhuma dependência de Angular, DOM ou browser. Assim ele é:
- testável isoladamente (golden tests),
- executável em Web Worker,
- reaproveitável e auditável.

## 3. Estrutura de pastas (proposta)

```
src/app/
  core/
    engine/
      decimal.config.ts        # precisão, modo de arredondamento
      rates.ts                 # conversões de taxa, day-count
      price.ts                 # cronograma Price
      sac.ts                   # cronograma SAC
      iof.ts                   # cálculo de IOF
      cet.ts                   # TIR/IRR (Newton + bisseção)
      solver.ts                # campo-alvo, locks, ordem topológica
      events/                  # amortização, quitação, antecipação, pagamento
      discount.ts              # desconto bancário (engine separado)
      models.ts                # tipos: Simulacao, Parcela, Evento, Encargo
    products/                  # presets (matriz da COMPLIANCE_NOTES §2)
    persistence/               # IndexedDB, import/export JSON
    export/                    # exceljs + pdfmake
  features/
    simulacao/                 # form + tabela + recálculo
    pos-simulacao/             # eventos
    comparativo/               # Price vs SAC lado a lado
  shared/                      # pipes (moeda BR), validators, ui
data/
  regulatory-config.json       # alíquotas/tetos versionados (datados)
  golden/                      # fixtures de teste de referência
```

## 4. Modelo de estado e recálculo

- `SimulationState` em signals: `params`, `targetField`, `lockedFields`,
  `schedule` (computed), `events`, `results` (computed: totais, CET).
- Edição de campo ⇒ `solver` resolve o campo-alvo ⇒ `schedule`/`results`
  recomputam reativamente.
- **Memoização** do cronograma por hash dos inputs (risco de performance do
  roadmap).
- Cronograma é **derivado** de `params + lista de eventos` ⇒ cancelar evento =
  reprojeção determinística.

## 5. Persistência e rastreabilidade (sem backend)

- Simulações salvas em **IndexedDB**; exportáveis/importáveis como **JSON**.
- Cada simulação grava: `engineVersion`, `regulatoryConfigVersion`, `params`,
  `timestamp`, e **hash** (SHA-256 do payload canônico) para auditoria.
- Export Excel/PDF inclui metadata: data/hora, versão do motor, hash.

## 6. Performance

- Web Worker para solver/CET e cronogramas longos (n até ~600).
- `OnPush` / signals para evitar re-render desnecessário.
- Cálculo incremental e memoizado.

## 7. Acessibilidade e i18n

- Locale **pt-BR** (moeda, datas, separador decimal).
- Componentes acessíveis (labels, navegação por teclado na tabela).
