import { describe, expect, it } from 'vitest';
import {
  type CatalogProduct,
  type ImageRow,
  type ImagesSummary,
  buildImagesSummary,
  isDue,
  offColumns,
  offImage,
  offRows,
  portalImageUrl,
  portalQueue,
  portalRow,
} from './images.ts';

const TODAY = '2026-11-17';
const COCA = '7790895000997';
const YERBA = '7793704000911';
const OTRO = '7790040929906';

const OFF_COCA = 'https://images.openfoodfacts.org/images/products/779/089/500/0997/front_es.12.200.jpg';

function existing(...rows: ImageRow[]): Map<string, ImageRow> {
  return new Map(rows.map(row => [row.ean, row]));
}

describe('URLs', () => {
  it('portal: la imagen se llama como el EAN', () => {
    expect(portalImageUrl(COCA)).toBe('https://imagenes.preciosclaros.gob.ar/productos/7790895000997.jpg');
  });
});

describe('export de Open Food Facts', () => {
  const header = ['code', 'url', 'product_name', 'countries_tags', 'image_url', 'image_small_url'].join('\t');
  const columns = offColumns(header)!;
  const line = (code: string, image: string) => [code, 'https://x', 'Nombre', 'en:argentina', 'https://grande.jpg', image].join('\t');

  it('encuentra las columnas del código y de la imagen chica', () => {
    expect(columns).toEqual({ code: 0, image: 5 });
    expect(offColumns(`${header}\r`)).toEqual({ code: 0, image: 5 });
  });

  it('sin alguna de las dos columnas: null', () => {
    expect(offColumns('code\timage_url')).toBeNull();
    expect(offColumns('product_name\timage_small_url')).toBeNull();
  });

  it('lee el EAN y la imagen de una fila', () => {
    expect(offImage(line(COCA, OFF_COCA), columns)).toEqual([COCA, OFF_COCA]);
  });

  it('normaliza los códigos a GTIN-13 (EAN-8, UPC-A)', () => {
    expect(offImage(line('77940131', OFF_COCA), columns)?.[0]).toBe('0000077940131');
    expect(offImage(line('036000291452', OFF_COCA), columns)?.[0]).toBe('0036000291452');
  });

  it('descarta filas sin imagen, con código inválido, con una URL que no es https o cortadas', () => {
    expect(offImage(line(COCA, ''), columns)).toBeNull();
    expect(offImage(line('7790895000990', OFF_COCA), columns)).toBeNull();   // dígito verificador incorrecto
    expect(offImage(line(COCA, 'http://images.openfoodfacts.org/y.jpg'), columns)).toBeNull();
    expect(offImage(COCA, columns)).toBeNull();
    expect(offImage('', columns)).toBeNull();
  });
});

describe('isDue', () => {
  it('nunca revisado: toca', () => {
    expect(isDue(undefined, TODAY)).toBe(true);
  });

  it('revisado hoy o hace menos de 90 días: no toca', () => {
    expect(isDue(TODAY, TODAY)).toBe(false);
    expect(isDue('2026-08-20', TODAY)).toBe(false);   // 89 días
  });

  it('revisado hace 90 días o más: toca', () => {
    expect(isDue('2026-08-19', TODAY)).toBe(true);    // 90 días
    expect(isDue('2025-01-01', TODAY)).toBe(true);
  });
});

describe('offRows', () => {
  const catalog: CatalogProduct[] = [{ ean: COCA, banderas: 12 }, { ean: YERBA, banderas: 3 }];

  it('guarda solo las imágenes de productos del catálogo', () => {
    const off = new Map([[COCA, OFF_COCA], [OTRO, 'https://images.openfoodfacts.org/o.jpg']]);
    expect(offRows(catalog, off, existing(), TODAY)).toEqual([
      { ean: COCA, url: OFF_COCA, fuente: 'off', revisado: TODAY },
    ]);
  });

  it('reemplaza una imagen del portal o un "sin imagen" aunque sean recientes', () => {
    const off = new Map([[COCA, OFF_COCA], [YERBA, 'https://images.openfoodfacts.org/y.jpg']]);
    const rows = offRows(catalog, off, existing(
      { ean: COCA, url: portalImageUrl(COCA), fuente: 'preciosclaros', revisado: '2026-11-10' },
      { ean: YERBA, url: null, fuente: null, revisado: '2026-11-10' },
    ), TODAY);
    expect(rows.map(r => [r.ean, r.fuente])).toEqual([[COCA, 'off'], [YERBA, 'off']]);
  });

  it('no vuelve a escribir una fila igual y revisada hoy', () => {
    const off = new Map([[COCA, OFF_COCA]]);
    const same = existing({ ean: COCA, url: OFF_COCA, fuente: 'off', revisado: TODAY });
    expect(offRows(catalog, off, same, TODAY)).toEqual([]);
  });

  it('una imagen de Open Food Facts de otra semana renueva su fecha', () => {
    const off = new Map([[COCA, OFF_COCA]]);
    const old = existing({ ean: COCA, url: OFF_COCA, fuente: 'off', revisado: '2026-11-10' });
    expect(offRows(catalog, off, old, TODAY)).toEqual([{ ean: COCA, url: OFF_COCA, fuente: 'off', revisado: TODAY }]);
  });
});

describe('portalQueue', () => {
  const catalog: CatalogProduct[] = [
    { ean: YERBA, banderas: 3 },
    { ean: COCA, banderas: 12 },
    { ean: OTRO, banderas: 7 },
  ];

  it('ordena de mayor a menor cantidad de banderas', () => {
    expect(portalQueue(catalog, new Map(), existing(), TODAY, true)).toEqual([COCA, OTRO, YERBA]);
  });

  it('con las mismas banderas, por EAN', () => {
    const tied: CatalogProduct[] = [{ ean: YERBA, banderas: 5 }, { ean: OTRO, banderas: 5 }];
    expect(portalQueue(tied, new Map(), existing(), TODAY, true)).toEqual([OTRO, YERBA]);
  });

  it('deja afuera los que trajo Open Food Facts', () => {
    expect(portalQueue(catalog, new Map([[COCA, OFF_COCA]]), existing(), TODAY, true)).toEqual([OTRO, YERBA]);
  });

  it('no vuelve a pedir un EAN revisado hace menos de 90 días, con o sin imagen', () => {
    const rows = existing(
      { ean: COCA, url: portalImageUrl(COCA), fuente: 'preciosclaros', revisado: TODAY },
      { ean: OTRO, url: null, fuente: null, revisado: '2026-10-01' },
    );
    expect(portalQueue(catalog, new Map(), rows, TODAY, true)).toEqual([YERBA]);
  });

  it('vuelve a pedir los revisados hace 90 días o más', () => {
    const rows = existing(
      { ean: COCA, url: portalImageUrl(COCA), fuente: 'preciosclaros', revisado: '2026-08-19' },
      { ean: OTRO, url: null, fuente: null, revisado: '2026-08-20' },
    );
    expect(portalQueue(catalog, new Map(), rows, TODAY, true)).toEqual([COCA, YERBA]);
  });

  it('una imagen vieja de Open Food Facts que ya no está en el export pasa al portal', () => {
    const rows = existing({ ean: COCA, url: OFF_COCA, fuente: 'off', revisado: '2026-08-01' });
    expect(portalQueue(catalog, new Map(), rows, TODAY, true)).toContain(COCA);
  });

  it('con el export de Open Food Facts incompleto, sus imágenes no se tocan', () => {
    const rows = existing({ ean: COCA, url: OFF_COCA, fuente: 'off', revisado: '2026-08-01' });
    expect(portalQueue(catalog, new Map(), rows, TODAY, false)).toEqual([OTRO, YERBA]);
  });

  it('respeta el tope por ejecución', () => {
    expect(portalQueue(catalog, new Map(), existing(), TODAY, true, 2)).toEqual([COCA, OTRO]);
  });
});

describe('portalRow', () => {
  it('200: guarda la URL del portal', () => {
    expect(portalRow(COCA, 200, TODAY)).toEqual(
      { ean: COCA, url: portalImageUrl(COCA), fuente: 'preciosclaros', revisado: TODAY });
  });

  it('otro código: se buscó y no hay', () => {
    expect(portalRow(COCA, 403, TODAY)).toEqual({ ean: COCA, url: null, fuente: null, revisado: TODAY });
    expect(portalRow(COCA, 404, TODAY).url).toBeNull();
  });
});

describe('buildImagesSummary', () => {
  const run: ImagesSummary = {
    error: null, offProductos: 4_300_000, offCompleto: true, offGuardadas: 3200,
    portalRevisados: 5000, portalConImagen: 1400, portalSinRespuesta: 2,
    totales: { productos: 75000, off: 3200, preciosClaros: 1400, sinImagen: 3600, pendientes: 66800 },
    segundos: 1265,
  };

  it('informa revisados, imágenes por fuente, sin imagen y pendientes', () => {
    const md = buildImagesSummary(run);
    expect(md.startsWith('## SEPA — imágenes de productos\n\n| | |\n|---|---|\n')).toBe(true);
    expect(md).toContain('| Resultado | ok |');
    expect(md).toContain('| Open Food Facts | 4.300.000 productos en el export · 3.200 imágenes guardadas |');
    expect(md).toContain('| Portal Precios Claros | 5.000 revisados · 1.400 con imagen · 2 sin respuesta |');
    expect(md).toContain('| Revisados en esta ejecución | 8.200 |');
    expect(md).toContain('| Productos del catálogo | 75.000 |');
    expect(md).toContain('| Con imagen | 4.600 (6,1 %) |');
    expect(md).toContain('| — de Open Food Facts | 3.200 (4,3 %) |');
    expect(md).toContain('| — de Precios Claros | 1.400 (1,9 %) |');
    expect(md).toContain('| Sin imagen | 3.600 (4,8 %) |');
    expect(md).toContain('| Pendientes de revisar | 66.800 (89,1 %) |');
    expect(md).toContain('| Duración | 21 min 5 s |');
  });

  it('con error y sin totales: el error y lo que se llegó a hacer', () => {
    const md = buildImagesSummary({ ...run, error: 'connect ETIMEDOUT', offCompleto: false, totales: null });
    expect(md).toContain('| Resultado | error — connect ETIMEDOUT |');
    expect(md).toContain('4.300.000 productos en el export (incompleto)');
    expect(md).not.toContain('Productos del catálogo');
  });
});
