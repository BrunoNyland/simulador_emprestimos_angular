import { Pipe, PipeTransform } from '@angular/core';

/** Converte data ISO (YYYY-MM-DD) para o formato brasileiro (DD/MM/YYYY). */
@Pipe({ name: 'dataBr', standalone: true })
export class DataBrPipe implements PipeTransform {
  transform(iso: string | null | undefined): string {
    if (!iso) {
      return '';
    }
    const partes = iso.split('-');
    if (partes.length !== 3) {
      return iso;
    }
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
}
