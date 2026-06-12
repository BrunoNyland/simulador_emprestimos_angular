import { Injectable, signal } from '@angular/core';
import { parseRegulatoryConfig, RegulatoryConfig } from '../products/regulatory-config';

/**
 * Config embutida (fallback) — espelha public/data/regulatory-config.jsonc.
 * Garante calculo sincrono/deterministico antes do fetch e em testes.
 */
export const CONFIG_PADRAO: RegulatoryConfig = {
  version: 'embutida',
  vigenciaInicio: '2026-01-01',
  defaults: {
    arredondamento: 'half-even',
    convencaoDias: '30/360',
    capitalizacaoPeriodoIrregular: 'composta',
    periodicidade: 'mensal',
  },
  iof: {
    aliquotaDiaria: { PF: '0.000082', PJ: '0.000041' },
    aliquotaAdicional: '0.0038',
    limiteDias: 365,
    produtosIsentos: ['habitacional'],
  },
  mora: { jurosMensal: '0.01', multa: '0.02' },
  tac: { permitidaPF: false },
  cet: { toleranciaTir: '1e-10', anualizacaoPeriodosAno: 12 },
  limites: { valorMaximo: 100000000, taxaMaximaPct: 100, prazoMaximo: 420 },
  formatos: { valor: '1.2-2', cetMensal: '1.2-4', cetAnual: '1.2-2' },
};

/**
 * Carrega a config regulatoria do JSONC em runtime (swappable sem rebuild),
 * com fallback para CONFIG_PADRAO.
 */
@Injectable({ providedIn: 'root' })
export class RegulatoryConfigService {
  readonly config = signal<RegulatoryConfig>(CONFIG_PADRAO);

  constructor() {
    void this.carregar();
  }

  private async carregar(): Promise<void> {
    try {
      const resp = await fetch('data/regulatory-config.jsonc');
      if (!resp.ok) {
        return;
      }
      this.config.set(parseRegulatoryConfig(await resp.text()));
    } catch {
      // mantem CONFIG_PADRAO
    }
  }
}
