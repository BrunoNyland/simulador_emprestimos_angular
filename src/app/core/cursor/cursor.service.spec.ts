import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CursorService } from './cursor.service';

function simularPonteiro(fino: boolean, reduzMovimento = false): void {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: consulta.includes('pointer: fine') ? fino : reduzMovimento,
  }));
}

describe('CursorService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.querySelectorAll('.cursor').forEach((el) => el.remove());
  });

  it('cria o ponto sem esconder o cursor nativo', () => {
    simularPonteiro(true);
    TestBed.inject(CursorService).iniciar();

    expect(document.querySelectorAll('.cursor').length).toBe(1);
    expect(getComputedStyle(document.body).cursor).not.toBe('none');
    expect(document.documentElement.className).toBe('');
  });

  it('aparece no primeiro movimento e vira anel sobre um botão', () => {
    simularPonteiro(true);
    TestBed.inject(CursorService).iniciar();
    const cursor = document.querySelector('.cursor')!;
    const botao = document.body.appendChild(document.createElement('button'));

    dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 50 }));
    expect(cursor.classList.contains('is-on')).toBe(true);
    expect((cursor as HTMLElement).style.transform).toContain('translate(40px, 50px)');

    botao.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(cursor.classList.contains('is-hover')).toBe(true);
    document.body.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(cursor.classList.contains('is-hover')).toBe(false);
    botao.remove();
  });

  it('avança a cada quadro mesmo com vários eventos por quadro (mouse de 1000 Hz)', () => {
    simularPonteiro(true);
    const quadros: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => quadros.push(cb));
    TestBed.inject(CursorService).iniciar();
    const cursor = document.querySelector('.cursor') as HTMLElement;
    const xAtual = () => Number(/translate\(([-\d.]+)px/.exec(cursor.style.transform)![1]);

    dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: 0 }));
    for (let quadro = 1; quadro <= 3; quadro++) {
      // 16 eventos entre um quadro e outro, como num mouse de 1000 Hz.
      for (let i = 1; i <= 16; i++) {
        dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 0 }));
      }
      // Roda todos os callbacks do quadro, como o navegador (os serviços dos
      // testes anteriores continuam ouvindo a janela e também enfileiram).
      quadros.splice(0).forEach((cb) => cb(quadro * 16));
    }
    // Três quadros de 16 ms com TAU de 45 ms: ~66% do caminho.
    expect(xAtual()).toBeGreaterThan(150);
    expect(xAtual()).toBeLessThan(300);
  });

  it('não liga em tela de toque nem com movimento reduzido', () => {
    simularPonteiro(false);
    TestBed.inject(CursorService).iniciar();
    expect(document.querySelector('.cursor')).toBeNull();

    TestBed.resetTestingModule();
    simularPonteiro(true, true);
    TestBed.inject(CursorService).iniciar();
    expect(document.querySelector('.cursor')).toBeNull();
  });
});
