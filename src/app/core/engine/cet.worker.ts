/// <reference lib="webworker" />
import { Decimal } from './decimal.config';
import { calcularCet } from './cet';

/** Mensagem de entrada: fluxos serializados (strings) + um seq p/ casar a resposta. */
interface PedidoCet {
  seq: number;
  valorLiberado: string;
  fluxos: { periodo: string; valor: string }[];
}

/**
 * Worker dedicado ao CET. A TIR com potências fracionárias `(1+i)^(dias/365)` é
 * o gargalo em prazos longos (centenas de ms a 360+ parcelas) e travava a UI.
 * Aqui o cálculo roda fora da main thread; o resultado volta serializado.
 */
addEventListener('message', ({ data }: MessageEvent<PedidoCet>) => {
  const { seq, valorLiberado, fluxos } = data;
  try {
    const cet = calcularCet(
      new Decimal(valorLiberado),
      fluxos.map((f) => ({ periodo: new Decimal(f.periodo), valor: new Decimal(f.valor) })),
      { periodosAno: 1 },
    );
    postMessage({
      seq,
      mensal: cet.mensal.toDecimalPlaces(6).toString(),
      anual: cet.anual.toDecimalPlaces(6).toString(),
    });
  } catch (e) {
    postMessage({ seq, erro: e instanceof Error ? e.message : 'Erro no cálculo do CET' });
  }
});
