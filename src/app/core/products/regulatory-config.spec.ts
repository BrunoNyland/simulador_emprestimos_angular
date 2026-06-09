import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseRegulatoryConfig,
  resolverParametrosIof,
  stripJsonComments,
} from './regulatory-config';

describe('regulatory-config loader', () => {
  it('remove comentarios // e /* */ sem quebrar URLs em strings', () => {
    const jsonc = `{
      // comentario de linha
      "site": "http://exemplo.com/path", /* bloco */
      "n": 1
    }`;
    const obj = JSON.parse(stripJsonComments(jsonc));
    expect(obj.site).toBe('http://exemplo.com/path');
    expect(obj.n).toBe(1);
  });

  it('faz parse do arquivo real public/data/regulatory-config.jsonc', () => {
    const texto = readFileSync(
      join(process.cwd(), 'public/data/regulatory-config.jsonc'),
      'utf-8',
    );
    const config = parseRegulatoryConfig(texto);
    expect(config.iof.aliquotaDiaria.PF).toBe('0.000082');
    expect(config.iof.aliquotaDiaria.PJ).toBe('0.000041');
    expect(config.defaults.arredondamento).toBe('half-even');
    expect(config.iof.produtosIsentos).toContain('habitacional');
  });

  it('resolve parametros de IOF por publico e isencao por produto', () => {
    const texto = readFileSync(
      join(process.cwd(), 'public/data/regulatory-config.jsonc'),
      'utf-8',
    );
    const config = parseRegulatoryConfig(texto);

    const pf = resolverParametrosIof(config, 'PF', 'credito-pessoal');
    expect(pf.aliquotaDiaria.toString()).toBe('0.000082');
    expect(pf.isento).toBe(false);

    const hab = resolverParametrosIof(config, 'PF', 'habitacional');
    expect(hab.isento).toBe(true);
  });
});
