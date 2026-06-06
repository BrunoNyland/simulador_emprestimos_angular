# Documentação e Roadmap do Projeto

## 1. Objetivo

Organização da documentação e roadmap de execução do **simulador de empréstimo
em Angular, 100% front-end**, com precisão bancária e conformidade BACEN
parametrizável.

## 2. Estrutura de documentação

| Documento | Conteúdo | Status |
|---|---|---|
| `SPEC.md` | Especificação funcional e requisitos | ✅ |
| `CALCULATION_REFERENCE.md` | Fórmulas, convenções, exemplos | ✅ |
| `COMPLIANCE_NOTES.md` | Normativos e matriz de produtos | ✅ |
| `ARCHITECTURE.md` | Stack, camadas, pastas | ✅ |
| `TEST_PLAN.md` | Estratégia e golden tests | ⬜ a criar na Fase 2 |
| `UX_GUIDE.md` | Fluxos, wireframes, validações | ⬜ a criar na Fase 3 |
| `EXPORT_FORMATS.md` | Layout dos exports | ⬜ a criar na Fase 5 |

## 3. Roadmap (alto nível)

### Fase 0 — Descoberta e compliance ✅ (em grande parte concluída)
- [x] Público (PF/PJ configurável) e produtos definidos (matriz em COMPLIANCE).
- [x] Convenções de day-count, CET e arredondamento definidas (CALC_REF).
- [ ] `data/regulatory-config.json` inicial (alíquotas/tetos datados).

### Fase 1 — Arquitetura e setup ✅ (concluída — ver PHASE1_IMPLEMENTATION.md)
- [x] Projeto Angular 22 (standalone, signals, zoneless, Vitest).
- [x] `decimal.js` 10.6.0 configurado (34 dígitos, half-even).
- [x] Esqueleto do **motor (TS puro)**: models + stubs (price/sac/iof/cet/solver).
- [x] Estrutura de pastas (ARCHITECTURE §3); locale pt-BR; config regulatória.
- [x] Testes verdes (5/5) e build de produção ok.

### Fase 2 — Motor de cálculo (núcleo da precisão bancária)
- Conversões de taxa + day-count; Price; SAC.
- IOF (PF/PJ, cap 365, isenções); CET por TIR (Newton + bisseção).
- Solver campo-alvo (locks, ordem topológica, ciclo/inviabilidade).
- Política de arredondamento + ajuste de resíduo.
- `TEST_PLAN.md` + **golden tests** vs. planilhas de referência.

### Fase 3 — Simulação e UI base
- Reactive Forms com campo-alvo/locks e validação imediata.
- Tabela de parcelas com totais; recálculo reativo (signals); memoização.
- Comparativo Price vs SAC. `UX_GUIDE.md`.

### Fase 4 — Pós-simulação
- Amortização extra (reduz prazo/parcela); quitação antecipada (VP);
  antecipação de parcelas; pagamento efetivo (mora); cancelamento determinístico.

### Fase 5 — Exportação
- Excel (`exceljs`) e PDF (`pdfmake`), com metadata (versões + hash).
- `EXPORT_FORMATS.md`.

### Fase 6 — Produtos e presets
- Presets da matriz (consignado, habitacional, penhor, CDC, desconto bancário,
  PJ + fundo garantidor) sobre o motor genérico.
- Web Worker para solver/CET e cronogramas longos.

### Fase 7 — Qualidade, persistência e release
- IndexedDB + import/export JSON; auditoria/logs.
- Regressão completa; e2e; revisão de compliance; deploy estático.

## 4. Backlog inicial (priorizado)
1. Motor TS puro com `decimal.js` e API clara.
2. Price/SAC + arredondamento + golden tests.
3. IOF + CET (TIR).
4. Solver campo-alvo (locks/ciclos).
5. UI: form + tabela + recálculo reativo.
6. Eventos pós-simulação.
7. Exportação Excel/PDF.
8. Presets de produtos.
9. Persistência + auditoria.

## 5. Riscos e mitigações
- **Precisão de ponto flutuante** → `decimal.js`, half-even, golden tests
  (risco nº 1; ausente na versão anterior do roadmap).
- Normas/alíquotas mudarem → `regulatory-config.json` versionado + COMPLIANCE.
- Divergência de arredondamento → testes de referência + ajuste de resíduo.
- Performance no recálculo → memoização + Web Worker + limites no solver.
- Solver divergir/loop → bisseção de fallback, tolerância e detector de ciclo.

## 6. Premissas e dependências
- Validação jurídica das pendências de `COMPLIANCE_NOTES.md` §4 antes de produção.
- Planilhas de referência do cliente para os golden tests.

## 7. Critérios de aceite (MVP)
- Price e SAC consistentes com planilhas de referência (golden tests passam).
- Recálculo dinâmico por campo-alvo (incl. líquido↔bruto↔parcela, parcela→taxa).
- CET e IOF calculados e exibidos.
- Tabela de parcelas com totais corretos e resíduo tratado.
- Pós-simulação (amortização, quitação, antecipação) funcionando.
- Exportação Excel e PDF com metadata.
- Casos de teste aprovados pelo cliente.
