# COMPLIANCE_NOTES — Mapeamento Regulatório e Decisões

> ⚠️ **Aviso:** este documento mapeia os normativos de referência e as decisões
> de implementação. **Não substitui validação jurídica/compliance.** Alíquotas,
> tetos e textos de disclosure mudam por norma e por data — todos entram no
> sistema como **parâmetros configuráveis**, nunca "hard-coded".

## 1. Normativos de referência (por tema)

| Tema | Normativo de referência | Impacto no sistema |
|---|---|---|
| CET (Custo Efetivo Total) | Resolução CMN 4.881/2020 (revoga 3.517/2007) | Cálculo por TIR; componentes auditáveis; exibição obrigatória ao cliente |
| Liquidação/amortização antecipada | Resolução CMN 3.516/2007; CDC art. 52 §2 | Desconto obrigatório de juros por valor presente |
| Vedação de TAC para PF | Resolução CMN 3.518/2007 e alterações | Tarifa de cadastro não pode ser default em PF |
| IOF | Decreto 6.306/2007 (e alterações posteriores) | Alíquota diária PF/PJ + adicional fixo; cap 365 dias; isenções |
| Informação/transparência | Resoluções de relacionamento e transparência (BCB) | Disclosures, CET em destaque, planilha de evolução |
| Consignado INSS | Normas do Conselho/INSS (teto de taxa, margem, prazo) | Tetos parametrizáveis por convênio |
| Habitacional (SFH/SFI) | Normas SFH; seguros MIP/DFI | Indexador (TR/IPCA), seguros obrigatórios no CET, isenção de IOF |
| Crédito rural / Pronamp | Normas de crédito rural; fundos garantidores (FGI/FAMPE) | Encargo do fundo no custo; condições específicas |

> As referências acima são **âncoras de partida**. A versão exata aplicável
> (numeração e redação vigente) deve ser confirmada na data de cada release e
> registrada em `data/regulatory-config.json` com data de vigência.

## 2. Matriz de produtos (parametrização)

| Produto | Público | Sistemas | IOF | Indexador | Encargos típicos | Regras especiais |
|---|---|---|---|---|---|---|
| Genérico / configurável | PF/PJ | Price/SAC | conforme | nenhum/config | configuráveis | tudo parametrizável |
| Crédito pessoal | PF/PJ | Price/SAC | sim | não | tarifa(PJ), seguro opc. | base do MVP |
| Consignado | PF | Price | sim | não | seguro prestamista | teto de taxa, prazo e margem |
| Financiamento CDC/veículo | PF/PJ | Price/SAC | sim | não | registro, gravame, seguro | entrada, valor residual |
| Penhor (jóias) | PF | Price/bullet | sim | não | avaliação, custódia | garantia, prazo curto, renovação |
| Habitacional (SFH/SFI) | PF | SAC/Price/SACRE | **isento** | TR/IPCA | MIP, DFI, taxa adm | seguros no CET, longo prazo |
| PJ + fundo garantidor (Pronamp/FGI/FAMPE) | PJ | Price/SAC | sim | config | comissão do fundo | encargo de garantia no custo |
| Desconto bancário | PJ | desconto | sim | não | tarifa de cobrança | engine próprio (juros "por fora") |

Cada produto é um **preset** que pré-configura: sistemas permitidos,
incidência/isenção de IOF, indexador, encargos default, tetos e textos de
disclosure. O usuário pode partir de um preset e ajustar (modo "configurável").

## 3. Decisões de compliance (registro)

1. **Sem hard-code de alíquotas.** Tudo em `regulatory-config.json` versionado e
   com data de vigência; o motor recebe a config como entrada.
2. **CET sempre exibido e auditável**, com lista de componentes incluídos.
3. **Quitação/antecipação** sempre com redução de juros por valor presente (não
   é opcional — é direito do consumidor).
4. **Arredondamento bancário (half-even)** como default, declarado na saída.
5. **Rastreabilidade:** cada simulação grava versão do motor, versão da config
   regulatória, parâmetros e hash (ver `ARCHITECTURE.md`).
6. **Disclaimers de simulação** no app e nos exports: "simulação, não constitui
   oferta de crédito".

## 4. Pendências para validação jurídica (bloqueiam "produção", não o MVP)

- Numeração/redação vigente exata de cada normativo na data do release.
- Alíquotas de IOF correntes (houve alterações em 2025) e lista de isenções.
- Tetos de taxa/prazo/margem do consignado por convênio.
- Componentes obrigatórios do CET por produto.
- Textos exatos de disclosure exigidos.
- Regras de mora (multa/juros) por produto.
