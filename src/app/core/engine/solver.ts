import { ParametrosSimulacao, SistemaAmortizacao } from './models';

/** Campo que o solver deve resolver (os demais ficam travados). */
export type CampoAlvo = 'valorBruto' | 'valorLiquido' | 'taxa' | 'prazo' | 'parcela';

export interface EntradaSolver {
  sistema: SistemaAmortizacao;
  parametros: ParametrosSimulacao;
  /** Valor da parcela, quando informado manualmente. */
  parcela?: string;
  campoAlvo: CampoAlvo;
  camposTravados: CampoAlvo[];
}

/**
 * Resolve o campo-alvo a partir dos campos travados (relacao Price/SAC).
 * "fixar 3, resolver 1" — ver CALCULATION_REFERENCE.md secao 8.
 *
 * TODO Fase 2: ordem topologica, deteccao de ciclo, formula fechada quando
 * possivel e Newton+bissecao para taxa; validar sobre-restricao/inviabilidade.
 */
export function resolverCampoAlvo(_entrada: EntradaSolver): ParametrosSimulacao {
  throw new Error('TODO Fase 2: resolverCampoAlvo ainda nao implementado');
}
