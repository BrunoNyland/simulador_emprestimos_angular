# Fase 4 — Passo a Passo da Implementação (Eventos pós-simulação)

> Cronograma = **função pura** de (base + lista de eventos). Cancelar um evento
> é apenas reprojetar sem ele (determinismo — CALC_REF §9.5).

## Engine — `core/engine/eventos.ts`
`projetarComEventos(entrada)` projeta o cronograma aplicando eventos ordenados por
`apos` (número da parcela após a qual o evento ocorre; 0 = antes da 1ª):

| Evento | Efeito |
|---|---|
| **Amortização extra** | abate o saldo; `reduzir-prazo` (mantém parcela, encurta) ou `reduzir-parcela` (mantém prazo, recalcula PMT) |
| **Quitação antecipada** | paga o saldo presente na data e encerra o cronograma |
| **Antecipação de parcelas** (Price) | abate o **valor presente** das próximas N parcelas (desconto à taxa do contrato) |
| **Pagamento com atraso** | aplica **mora** (multa + juros de mora pro-rata) na parcela |

Saída: `parcelas` (com `observacao` por linha) + `resumo` (total juros/amortização/
encargos/pago, **amortizações extras**, **economia de juros** vs. base, **prazo final**).

## Integração no store — `features/simulacao/simulacao.store.ts`
- `eventos` (signal) + `adicionarEvento` / `removerEvento` / `limparEventos`.
- Quando há eventos, `resultado` usa `projetarComEventos` e expõe `resumoEventos`;
  o **CET é omitido** nessa fase (incluiria os pré-pagamentos no fluxo).

## UI — painel "Eventos pós-simulação"
- Formulário para adicionar evento (tipo, após qual parcela, valor/quantidade/
  opção/dias de atraso) com campos condicionais por tipo.
- Lista de eventos com botão **Cancelar** (remove e reprojeta).
- Coluna **Obs.** na tabela destaca a parcela afetada; cartões de resumo
  (prazo final, economia de juros, amortizações extras, mora).

## Verificação
- Testes: **52 passando** (13 arquivos) — `eventos.spec.ts` (7) + store (2 novos).
- Build de produção: OK (~335 kB).
- Browser (Playwright): amortização extra 200 reduzir-prazo → **12 → 10 meses**,
  economia **R$ 21,36**; **cancelar** → volta a 12; quitação após parc. 6 →
  6 linhas com obs "Quitacao antecipada: 514.92"; 0 erros de console.

## Pendências resolvidas (segunda rodada)
- ✅ **Antecipação no SAC**: VP das próximas N parcelas projetadas a partir do
  saldo (Price e SAC).
- ✅ **CET com eventos**: `projetarComEventos` monta o fluxo de caixa real
  (parcelas + pré-pagamentos no período em que ocorrem) e chama `calcularCet`;
  `resumo.cetMensal/cetAnual` exibidos na UI. Sem tarifas, o CET ≈ taxa do
  contrato mesmo com pré-pagamentos (correto).
- ✅ **Pagamento parcial**: evento `pagamento` aceita `valorPago`; cobre juros e
  amortiza o resto, **re-amortizando mantendo o prazo**; pagar < juros gera erro
  (amortização negativa).
- ✅ **Eventos por data**: a UI permite indexar por data; mapeia para `apos` e,
  na **quitação**, calcula juros **pro-rata** até a data (`fracaoPeriodo`),
  separando o principal (amortização) da parte de juros pro-rata.

## Escopo / limites restantes
- Mapeamento por data aplica pro-rata na **quitação**; amortização/antecipação
  por data usam o vencimento anterior como referência (sem pro-rata no extra).
- IOF/tarifas de abertura ainda não entram no CET (Fase 5/encargos).
- Regra de pagamento parcial é a default (re-amortizar mantendo prazo);
  parametrizável depois.

## Próximo passo (Fase 5)
Exportação Excel (.xlsx via exceljs) e PDF (via pdfmake) do cronograma e resumo,
com metadata (data/hora, versão do motor, hash).
