# UX_ANALYSIS — Análise de UX (público técnico / validação)

> Análise de melhorias de experiência sob a ótica de UX design, focada no
> **usuário final real**: um **corpo técnico** que usa o sistema para **validar os
> valores gerados por um backend** e rodar **simulações internas**. Esse público
> domina os termos (Price/SAC, CET, IOF, bruto×líquido) e precisa de **visão do
> todo, densidade, precisão e comparabilidade** — não de simplificação.

## 0. Premissa e o que NÃO se aplica

Por ser ferramenta técnica interna (e não voltada ao consumidor final), descartam-se
melhorias de "consumerização":

- ❌ "Número-herói" (destacar a parcela acima de tudo).
- ❌ Sliders no lugar de entrada numérica.
- ❌ Reescrever jargão para linguagem leiga.
- ❌ Tooltips educativos em CET/IOF/Price-SAC.
- ❌ Colapsar tudo por padrão (esconde a visão do todo).

O foco passa a ser: **validar e enxergar tudo com rastreabilidade.**

---

## 1. 🔴 Alto impacto — o trabalho real (validar e ver tudo)

### 1.1 Modo de validação: colar valores do backend e ver o *diff*
Caso de uso central. Painel onde o testador cola os valores esperados (parcela, CET,
total de juros, ou o cronograma inteiro) e a UI **destaca match/divergência com o
delta** (verde/vermelho + diferença em R$ e %). Troca "conferir número a número no
olho" por "bater o olho e ver onde diverge". **Maior alavanca para o público.**

### 1.2 Toggle de precisão (2 casas ↔ alta precisão) + resíduo explícito
Eles validam *precisão bancária*. Exibir só 2 casas esconde o que importa numa
divergência de centavo. Propor:
- Switch **"exibir alta precisão"** (6–10 casas) nos números.
- Indicador de **quanto a última parcela absorveu de resíduo** de arredondamento.

Ataca diretamente a classe de bug que esse time caça.

### 1.3 Memória de cálculo / auditoria
Painel mostrando **valores resolvidos e como** cada número foi obtido:
- Taxa efetiva mensal realmente usada.
- Convenção de dias (dias/365), arredondamento (half-even).
- IOF detalhado: **diário + adicional** separados.
- Versão do motor e **hash** da simulação.

Para quem valida, **rastreabilidade > estética**.

### 1.4 Visão do todo / densidade
"Visão do todo" briga com o respiro atual. Propor:
- Botão **"Expandir/Recolher tudo"**.
- **Modo compacto** (menos padding, fontes menores).
- Manter seções abertas por padrão; permitir resumo + cronograma + comparativo com
  menos rolagem.

### 1.5 Exportar / copiar / JSON
- Copiar célula/coluna; exportar **CSV** do cronograma.
- **Visão JSON** no formato do modelo de dados, para **diff direto com o payload do
  backend**. (Conversa com a Fase 5, porém com foco em **paridade técnica**, não em
  relatório.)

---

## 2. 🟡 Médio impacto

### 2.1 Estado na URL (deep-link)
Front-end puro permite **serializar a simulação inteira na URL**. Um testador
reproduz a divergência e compartilha o link: "esse cenário exato quebra". Excelente
para colaboração do time.

### 2.2 Colunas de *delta* nas comparações
- Price × SAC e base × pós-eventos: adicionar coluna de **diferença** (não só os dois
  valores lado a lado).
- Cronograma: colunas opcionais de **acumulado** (juros acumulados, amortizado
  acumulado).

### 2.3 Navegação no cronograma longo
Com prazo até ~600: **"ir para a parcela N"**, filtrar/realçar e **congelar a 1ª
coluna** (além do cabeçalho fixo já existente).

### 2.4 Gráficos como *sanity-check*
Menos "vender", mais **flagrar anomalia**: saldo devedor não-monotônico ou juros
subindo onde não deveriam saltam aos olhos num gráfico antes que numa tabela.
Validação visual rápida.

---

## 3. 🟢 Refinamentos

### 3.1 Repensar a máscara da taxa para entrada precisa
A máscara de centavos (digitar "200" → 2,00) é ótima para **moeda**, mas para
**taxa** um técnico pode querer colar "0,0082" ou comparar com a fração do backend.
Vale um input mais direto/colável no campo de taxa.

### 3.2 Acessibilidade sem depender de cor
Cadeado no campo "calculado" (hoje indicado só por verde), atalhos de teclado e
ordem de tab para entrada rápida.

### 3.3 Indicador de "fora do padrão"
Sinalizar quando um edge case ocorreu (amortização negativa, IOF no teto de 365
dias, produto isento) — exatamente os casos que eles testam.

---

## 4. Recomendação de sequência

| Ordem | Item | Por quê |
|---|---|---|
| 1 | Modo de validação / diff com backend (§1.1) | É o trabalho central do usuário |
| 2 | Toggle de precisão + resíduo (§1.2) | Onde mora a divergência de centavo |
| 3 | Memória de cálculo / auditoria (§1.3) | Rastreabilidade do "como" |
| 4 | Densidade / expandir tudo (§1.4) | "Visão do todo" |
| 5 | Estado na URL (§2.1) | Colaboração / reproduzir cenário |
| 6 | Export CSV/JSON + gráficos (§1.5, §2.4) | Paridade técnica e sanity-check |

**Núcleo do "validar": itens 1 + 2 + 3.** "Visão do todo" e colaboração: 4 + 5.

---

_Documento de análise; não altera comportamento do sistema. Itens podem ser
promovidos a uma fase de implementação (ex.: "Fase 4.6 — Ferramentas de validação")._
