# Fase 4.5 — UX e Identidade Visual

> Melhorias de interface profissionais, sem alterar a lógica do motor.

## Entregas

### Tema claro/escuro
- `core/theme/theme.service.ts`: signal `tema`, toggle, persistência em
  localStorage e respeito a `prefers-color-scheme` (tolerante a ambientes sem
  matchMedia/DOM).
- Aplica `data-theme` no `<html>`; toggle no header (`app.html`).
- **Design tokens** (CSS variables) em `styles.scss` para claro e escuro: bg,
  surfaces, bordas, texto, primária, acento, linhas de tabela, sombras, raios.

### Separação visual das seções
- Todo bloco vira um **cartão** (`.cartao`) com borda, sombra e cabeçalho com
  barra de destaque (`.cartao__cab h2::before`). Subtítulos contextuais.
- A seção "Resultado após eventos" tem realce de borda (`.cartao--evento`).

### Tabelas profissionais
- **Zebra**: `tbody tr:nth-child(odd/even)` com cores distintas.
- **Hover**: realce de linha (`tbody tr:hover`).
- Cabeçalho fixo (`thead th { position: sticky }`), rolagem horizontal,
  totais destacados no `tfoot`, parcela em negrito.

### Eventos em tabela separada (não altera a base)
- O store passou a expor **dois** resultados:
  - `resultado` → **simulação base** (sempre, sem eventos).
  - `eventosResultado` → projeção com eventos (tabela + resumo) ou `null`.
- A UI mostra a tabela base e, quando há eventos, uma **nova tabela abaixo**
  ("Resultado após eventos") — permitindo comparar base × pós-eventos.

### Outros refinos
- Cards de resumo com destaque (gradiente) para a métrica principal.
- Foco acessível (`:focus` com anel), transições suaves, botões com estados.
- Budget de estilo de componente ajustado em `angular.json` (8kB/16kB).

## Correções de formulário (rodada de ajustes)
- **"Data-base" → "Data da liberação do crédito"** (rótulo mais claro; é a data
  usada para IOF/CET).
- **Ícone do date no escuro**: `color-scheme: light/dark` por tema em `styles.scss`
  faz os controles nativos (date picker, scrollbars) acompanharem o tema.
- **"Tipo de taxa" (efetiva/nominal)**: só altera o resultado para taxa **anual**
  (em base mensal, efetiva = nominal). O campo agora é **desabilitado** quando a
  unidade é mensal, com nota explicativa; em anual funciona (parcela muda).
  Disabled "comum" agora é cinza neutro; verde fica só para o campo-alvo calculado.
- **Input de moeda** (`shared/moeda-input.directive.ts`, `appMoeda` CVA): máscara
  pt-BR com separador de milhar e 2 casas; rejeita negativos; teto via `[max]`
  (R$ 100 mi). Aplicado a valor bruto, parcela, tarifa e valores de evento.
- **Input de taxa em %**: exibida em porcentagem (store mantém fração) com a
  mesma máscara `appMoeda` (2 casas fixas, sem negativos, teto 100%); o componente
  converte %↔fração (`fracaoParaPct`/`pctParaFracao`).

## Verificação (browser, Playwright)
- Tema inicial claro; toggle → `data-theme="escuro"`, `body` escuro. 0 erros.
- Zebra: linha ímpar ≠ par; hover muda a cor da linha.
- Sem eventos: 5 seções; com evento: 6 (surge "Resultado após eventos").
- Tabela base permanece intacta ao adicionar evento (tabela nova é separada).
- Testes: 64/64; build de produção ok.
