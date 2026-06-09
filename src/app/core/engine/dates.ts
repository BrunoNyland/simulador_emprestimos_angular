/**
 * Utilitarios de data (sem dependencias externas).
 * Datas no formato ISO YYYY-MM-DD, tratadas em UTC para evitar drift de fuso.
 */

const MS_POR_DIA = 86_400_000;

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatISO(data: Date): string {
  const y = data.getUTCFullYear();
  const m = String(data.getUTCMonth() + 1).padStart(2, '0');
  const d = String(data.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Dias corridos entre duas datas ISO (ate - de). */
export function diasCorridos(de: string, ate: string): number {
  return Math.round((parseISO(ate).getTime() - parseISO(de).getTime()) / MS_POR_DIA);
}

/**
 * Adiciona `meses` a uma data ISO, ajustando para o ultimo dia do mes quando
 * o dia original nao existe no mes alvo (ex.: 31/01 + 1 mes => 28/02).
 */
export function adicionarMeses(iso: string, meses: number): string {
  const dt = parseISO(iso);
  const dia = dt.getUTCDate();
  const alvo = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + meses, 1));
  const ultimoDiaMes = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDiaMes));
  return formatISO(alvo);
}
