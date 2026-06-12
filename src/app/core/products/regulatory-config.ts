import { Decimal } from '../engine/decimal.config';
import { ParametrosIof } from '../engine/iof';
import {
  ConvencaoDias,
  ModoArredondamento,
  Periodicidade,
  Publico,
} from '../engine/models';

/** Estrutura da config regulatoria (ver public/data/regulatory-config.jsonc). */
export interface RegulatoryConfig {
  version: string;
  vigenciaInicio: string;
  observacao?: string;
  defaults: {
    arredondamento: ModoArredondamento;
    convencaoDias: ConvencaoDias;
    capitalizacaoPeriodoIrregular: 'composta' | 'linear';
    periodicidade: Periodicidade;
  };
  iof: {
    aliquotaDiaria: Record<Publico, string>;
    aliquotaAdicional: string;
    limiteDias: number;
    produtosIsentos: string[];
  };
  mora: { jurosMensal: string; multa: string };
  tac: { permitidaPF: boolean };
  cet: { toleranciaTir: string; anualizacaoPeriodosAno: number };
  limites: { valorMaximo: number; taxaMaximaPct: number; prazoMaximo: number };
  formatos: { valor: string; cetMensal: string; cetAnual: string };
}

/**
 * Remove comentarios de um texto JSONC (// e /* *\/) preservando os que
 * aparecem dentro de strings (ex.: URLs "http://...").
 */
export function stripJsonComments(input: string): string {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1];

    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && next === '/') {
      inLine = true;
      i++;
    } else if (c === '/' && next === '*') {
      inBlock = true;
      i++;
    } else {
      out += c;
    }
  }

  return out;
}

/** Faz o parse do texto JSONC da config regulatoria. */
export function parseRegulatoryConfig(texto: string): RegulatoryConfig {
  return JSON.parse(stripJsonComments(texto)) as RegulatoryConfig;
}

/** Resolve os parametros de IOF para um publico/produto a partir da config. */
export function resolverParametrosIof(
  config: RegulatoryConfig,
  publico: Publico,
  produto: string,
): ParametrosIof {
  return {
    aliquotaDiaria: new Decimal(config.iof.aliquotaDiaria[publico]),
    aliquotaAdicional: new Decimal(config.iof.aliquotaAdicional),
    limiteDias: config.iof.limiteDias,
    isento: config.iof.produtosIsentos.includes(produto),
  };
}
