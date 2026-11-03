import { describe, expect, it } from 'vitest';
import { buildInsert, checkRules } from './load.ts';

describe('buildInsert', () => {
  it('arma un INSERT multi-fila con un parámetro por valor', () => {
    const { text, values } = buildInsert('tmp_precios', ['ean', 'minimo'], [['7791720048313', 2090], ['0000077956262', 4210]]);
    expect(text).toBe('insert into tmp_precios (ean, minimo) values ($1, $2), ($3, $4)');
    expect(values).toEqual(['7791720048313', 2090, '0000077956262', 4210]);
  });

  it('falla si una fila no tiene un valor por columna', () => {
    expect(() => buildInsert('tmp_precios', ['ean', 'minimo'], [['7791720048313']])).toThrow(/columnas/);
  });
});

describe('checkRules', () => {
  const precios = (n: number) => Array.from({ length: n }, () => ({ ean: '', bandera: '', minimo: 1, mediana: 1, maximo: 1, sucursales: 1 }));
  const sinCargas = { maxFecha: null, mismaFecha: false, filasPrecios: null };
  const viernes = { fechaArchivo: '2026-10-30', precios: precios(100) };

  it('sin carga ok previa se carga, sin freno', () => {
    expect(checkRules({ fechaArchivo: '2026-10-30', precios: precios(1) }, sinCargas, false)).toBeNull();
  });

  it('1. un archivo anterior a la última carga ok se omite, salvo --force', () => {
    const ultima = { maxFecha: '2026-11-02', mismaFecha: false, filasPrecios: 100 };
    expect(checkRules(viernes, ultima, false)).toEqual({ estado: 'omitida', detalle: 'archivo anterior a la última carga (2026-11-02)' });
    expect(checkRules(viernes, ultima, true)).toBeNull();
  });

  it('2. un archivo con la misma fecha que una carga ok se omite, salvo --force', () => {
    const ultima = { maxFecha: '2026-10-30', mismaFecha: true, filasPrecios: 100 };
    expect(checkRules(viernes, ultima, false)?.estado).toBe('omitida');
    expect(checkRules(viernes, ultima, true)).toBeNull();
  });

  it('3. el freno del 50 % frena también con --force', () => {
    const ultima = { maxFecha: '2026-10-29', mismaFecha: false, filasPrecios: 201 };
    expect(checkRules(viernes, ultima, false)?.estado).toBe('error');
    expect(checkRules(viernes, ultima, true)?.detalle).toMatch(/freno de seguridad/);
  });

  it('3. justo el 50 % pasa el freno', () => {
    expect(checkRules(viernes, { maxFecha: '2026-10-29', mismaFecha: false, filasPrecios: 200 }, false)).toBeNull();
  });
});
