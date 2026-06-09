# Fase 1 — Passo a Passo da Implementação (Arquitetura e Setup)

> Log vivo da execução da Fase 1. Atualizado conforme cada passo é concluído.
> Objetivo da fase: terreno pronto (projeto roda, decimal configurado, camadas e
> tipos criados, testes funcionando) — **sem implementar fórmulas** (isso é Fase 2).

## Ambiente
- Node: **v24.16.0** (Krypton — LTS mais recente; instalado via nvm-windows)
- npm: 11.13.0
- Angular CLI: **22.0.0** (mais recente; suporta Node ^22.22.3 || ^24.15.0 || >=26.0.0)
- OS: Windows 11 / PowerShell
- Nota: a pedido do cliente, Node e Angular foram atualizados para as versões LTS/mais recentes antes do scaffold.

## Passos

### 1. Criar o projeto Angular ✅
- `ng new simulador-emprestimo --directory . --style=scss --routing --ssr=false
  --package-manager=npm --skip-git --defaults`.
- Angular 22 gera **standalone + signals + zoneless** (sem zone.js) e usa
  **Vitest** como runner de testes (jsdom).
- Nota: o `.gitignore` que o cliente já havia commitado foi preservado (o do
  `ng new` foi descartado); acrescentado apenas `*.tsbuildinfo`.
- Critério atendido: `npm start` (ng serve) sobe e responde HTTP 200.

### 2. Configurar precisão decimal ✅
- `npm i decimal.js` (v10.6.0).
- `src/app/core/engine/decimal.config.ts`: precisão **34 dígitos**, modo
  **ROUND_HALF_EVEN** (bancário); helper `arredondarMoeda()`.
- Regra do projeto: proibido `number` nativo para dinheiro/taxa.

### 3. Configurar locale pt-BR ✅
- `registerLocaleData(localePt, 'pt-BR')` + `{ provide: LOCALE_ID, useValue:
  'pt-BR' }` em `app.config.ts`.

### 4. Estrutura de pastas (camadas) ✅
Criada conforme ARCHITECTURE.md §3 (`core/engine`, `core/products`,
`core/persistence`, `core/export`, `features`, `shared`), com README em cada
pasta ainda não implementada. A config regulatória ficou em **`public/data/`**
(servida em runtime, swappável sem rebuild) — refinamento sobre o doc, que
previa `data/`.

### 5. Modelo de dados + stubs do motor ✅
- `core/engine/models.ts`: `Simulacao`, `Parcela`, `Evento`, `Encargo` + enums.
- `version.ts` (`ENGINE_VERSION`), `index.ts` (barrel).
- Stubs que lançam "TODO Fase 2": `price.ts`, `sac.ts`, `iof.ts`, `cet.ts`,
  `solver.ts`.

### 6. Config regulatória inicial ✅
- `public/data/regulatory-config.jsonc` (**JSONC** — comentado opção a opção, com
  os valores possíveis de cada campo). Inclui: defaults de cálculo
  (arredondamento, convenção de dias, capitalização, periodicidade), IOF PF/PJ
  (0,0082%/0,0041%), adicional 0,38%, cap 365 dias, isenção habitacional, mora,
  TAC PF vedada, CET. Valores de **referência**, a validar (COMPLIANCE_NOTES §4).
- Formato JSONC: o loader da Fase 2 remove comentários antes do `JSON.parse`
  (mesma abordagem do `tsconfig.json`).

### 7. Testes ✅
- Vitest (`ng test --watch=false`).
- `decimal.config.spec.ts`: sem erro de float, half-even, soma monetária exata.
- Resultado: **5 testes, 5 passando** (2 do app + 3 do decimal).

## Resultados
- [x] App abre no navegador (HTTP 200 em `ng serve`)
- [x] decimal.js configurado (half-even, 34 dígitos)
- [x] locale pt-BR
- [x] estrutura de pastas + tipos
- [x] regulatory-config.json (em `public/data/`)
- [x] testes verdes (5/5)
- [x] build de produção ok (`ng build` → 216 kB)

## Versões finais
- Node v24.16.0 · npm 11.13.0 · Angular CLI/Framework 22.0.0 · decimal.js 10.6.0
- Runner: Vitest 4.x · App: standalone, zoneless, SCSS, routing

## Próximo passo (Fase 2)
Implementar o motor: conversões de taxa + day-count, Price, SAC, IOF, CET (TIR),
solver de campo-alvo, arredondamento/resíduo — cada um com golden tests
(`TEST_PLAN.md`).
