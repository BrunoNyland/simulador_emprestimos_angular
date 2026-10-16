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
