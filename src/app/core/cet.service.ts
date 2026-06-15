import { Injectable } from '@angular/core';
import { Decimal } from './engine/decimal.config';
import { calcularCet } from './engine/cet';

/** Fluxo de caixa serializado (Decimal -> string) para cruzar a fronteira do worker. */
export interface FluxoSerial {
  periodo: string;
  valor: string;
}

export interface EntradaCet {
  valorLiberado: string;
  fluxos: FluxoSerial[];
}

export interface ResultadoCetSerial {
  mensal: string;
  anual: string;
}

/**
 * Calcula o CET (TIR/365 — BACEN) fora da main thread.
 *
 * Em prazos longos a TIR domina o tempo de simulação e travava a UI; aqui o
 * trabalho é delegado a um Web Worker e o resultado volta de forma assíncrona.
 * Onde não há Worker (Node/SSR/testes) cai num cálculo síncrono equivalente.
 */
@Injectable({ providedIn: 'root' })
export class CetService {
  private worker?: Worker;
  private seq = 0;
  private readonly pendentes = new Map<number, { resolve: (r: ResultadoCetSerial) => void; entrada: EntradaCet }>();

  constructor() {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./engine/cet.worker', import.meta.url), { type: 'module' });
        this.worker.onmessage = ({ data }) => this.aoReceber(data);
      } catch {
        // Ambiente anuncia Worker mas não consegue instanciar o módulo -> fallback.
        this.worker = undefined;
      }
    }
  }

  /** Solicita o CET de um fluxo. Resolve com mensal/anual já formatados (6 casas). */
  solicitar(entrada: EntradaCet): Promise<ResultadoCetSerial> {
    if (!this.worker) {
      return Promise.resolve(this.calcularLocal(entrada));
    }
    const seq = ++this.seq;
    return new Promise<ResultadoCetSerial>((resolve) => {
      this.pendentes.set(seq, { resolve, entrada });
      this.worker!.postMessage({ seq, ...entrada });
    });
  }

  private aoReceber(data: { seq: number; mensal?: string; anual?: string; erro?: string }): void {
    const pendente = this.pendentes.get(data.seq);
    if (!pendente) return;
    this.pendentes.delete(data.seq);
    if (data.erro || data.mensal === undefined || data.anual === undefined) {
      // Worker falhou: recalcula na main thread (raro; mantém o app funcional).
      pendente.resolve(this.calcularLocal(pendente.entrada));
      return;
    }
    pendente.resolve({ mensal: data.mensal, anual: data.anual });
  }

  private calcularLocal(entrada: EntradaCet): ResultadoCetSerial {
    const cet = calcularCet(
      new Decimal(entrada.valorLiberado),
      entrada.fluxos.map((f) => ({ periodo: new Decimal(f.periodo), valor: new Decimal(f.valor) })),
      { periodosAno: 1 },
    );
    return {
      mensal: cet.mensal.toDecimalPlaces(6).toString(),
      anual: cet.anual.toDecimalPlaces(6).toString(),
    };
  }
}
