import { analisarLinhaHp12c } from './hp12c-format';

describe('analisarLinhaHp12c', () => {
  it('linha de teclas pura: classifica número, teclas e comentário entre parênteses', () => {
    const r = analisarLinhaHp12c('1000 CHS PV   (valor financiado)');
    expect(r.prosa).toBe(false);
    expect(r.comentario).toBe('(valor financiado)');
    expect(r.segs.map((s) => [s.tipo, s.texto])).toEqual([
      ['num', '1000'],
      ['tecla', 'CHS'],
      ['tecla', 'PV'],
    ]);
  });

  it('separa o comentário após a seta →', () => {
    const r = analisarLinhaHp12c('PMT   → exibe 945,60');
    expect(r.prosa).toBe(false);
    expect(r.comentario).toBe('→ exibe 945,60');
    expect(r.segs).toEqual([{ tipo: 'tecla', texto: 'PMT' }]);
  });

  it('marca os modificadores f (dourado) e g (azul)', () => {
    const r = analisarLinhaHp12c('f CLX');
    expect(r.segs[0]).toEqual({ tipo: 'tecla', texto: 'f', modificador: 'f' });
    expect(r.segs[1].modificador).toBeUndefined();
    expect(analisarLinhaHp12c('g END').segs[0].modificador).toBe('g');
  });

  it('frase com teclas embutidas vira prosa, mas mantém teclas como botões', () => {
    const r = analisarLinhaHp12c('Antes de começar: pressione f CLX para limpar (fim do período) e g END');
    expect(r.prosa).toBe(true);
    // o parêntese NÃO é final → permanece como texto, não vira comentário
    expect(r.comentario).toBe('');
    const teclas = r.segs.filter((s) => s.tipo === 'tecla').map((s) => s.texto);
    expect(teclas).toContain('f');
    expect(teclas).toContain('CLX');
    expect(teclas).toContain('END');
    // números dentro de prosa permanecem texto (não viram operando)
    expect(r.segs.some((s) => s.tipo === 'num')).toBe(false);
  });

  it('operadores aritméticos são teclas', () => {
    const r = analisarLinhaHp12c('10000 ENTER 380 −');
    expect(r.prosa).toBe(false);
    expect(r.segs.map((s) => s.texto)).toEqual(['10000', 'ENTER', '380', '−']);
    expect(r.segs[3].tipo).toBe('tecla');
  });

  it('linha sem tokens (vazia) não quebra', () => {
    const r = analisarLinhaHp12c('   ');
    expect(r.segs).toEqual([]);
    expect(r.prosa).toBe(true);
  });
});
