import { describe, expect, it } from 'vitest';
import {
  type ComercioRow,
  type ProductoRow,
  type SucursalRow,
  checkFreshness,
  createComercioAggregator,
  createProductAccumulator,
} from './aggregate.ts';

// ── Comercio de juguete: 2 banderas, 3 sucursales ─────────────────────────────────────────────

const COMERCIO: ComercioRow[] = [
  { idComercio: '10', idBandera: '1', razonSocial: 'INC S.A.', banderaNombre: 'Hipermercado Carrefour' },
  { idComercio: '10', idBandera: '2', razonSocial: 'INC S.A.', banderaNombre: 'Carrefour  Market' },
];

const SUCURSALES: SucursalRow[] = [
  { idComercio: '10', idBandera: '1', idSucursal: '1' },
  { idComercio: '10', idBandera: '1', idSucursal: '2' },
  { idComercio: '10', idBandera: '2', idSucursal: '7' },
];

const MIX = '7791720048313';   // presentación Carrefour: 1 UNI / referencia 40 GRM
const SAL = '0000077956262';   // descripciones distintas según la sucursal

function row(overrides: Partial<ProductoRow>): ProductoRow {
  return {
    idComercio: '10',
    idBandera: '1',
    idSucursal: '1',
    idProducto: MIX,
    productosEan: '1',
    descripcion: 'MIX CROCANTE CARREFOUR CLASSIC X 40 GRS',
    cantidadPresentacion: '1',
    unidadPresentacion: 'UNI',
    marca: 'CARREFOUR CLASSIC',
    precioLista: '2090.00',
    cantidadReferencia: '40',
    unidadReferencia: 'GRM',
    ...overrides,
  };
}

function sal(idBandera: string, idSucursal: string, descripcion: string, precioLista: string): ProductoRow {
  return row({
    idBandera, idSucursal, idProducto: SAL, descripcion, precioLista, marca: 'CELUSAL',
    cantidadPresentacion: '250', unidadPresentacion: 'GR', cantidadReferencia: '1', unidadReferencia: 'KG',
  });
}

function toyComercio() {
  const agg = createComercioAggregator(COMERCIO, SUCURSALES);
  agg.add(row({ idSucursal: '1', precioLista: '2090.00' }));
  agg.add(row({ idSucursal: '2', precioLista: '2190.00' }));
  agg.add(row({ idBandera: '2', idSucursal: '7', precioLista: '1990.00' }));
  agg.add(sal('1', '1', 'SAL FINA CELUSAL 250 G', '04210.00'));
  agg.add(sal('1', '2', 'SAL FINA  CELUSAL   250 G', '4300.00'));
  agg.add(sal('2', '7', 'SAL CELUSAL X250G', '4100.00'));
  return agg;
}

describe('createComercioAggregator', () => {
  it('resume cada bandera con nombre, razón social y sucursales de sucursales.csv', () => {
    expect(toyComercio().finish().banderas).toEqual([
      { id: '10-1', comercioId: 10, banderaId: 1, nombre: 'Hipermercado Carrefour', razonSocial: 'INC S.A.', sucursales: 2 },
      { id: '10-2', comercioId: 10, banderaId: 2, nombre: 'Carrefour Market', razonSocial: 'INC S.A.', sucursales: 1 },
    ]);
  });

  it('agrega mínimo, mediana, máximo y sucursales por EAN × bandera', () => {
    const precios = toyComercio().finish().precios;
    expect(precios).toHaveLength(4);
    expect(precios).toContainEqual({ ean: MIX, bandera: '10-1', minimo: 2090, mediana: 2140, maximo: 2190, sucursales: 2 });
    expect(precios).toContainEqual({ ean: MIX, bandera: '10-2', minimo: 1990, mediana: 1990, maximo: 1990, sucursales: 1 });
    expect(precios).toContainEqual({ ean: SAL, bandera: '10-1', minimo: 4210, mediana: 4255, maximo: 4300, sucursales: 2 });
    expect(precios).toContainEqual({ ean: SAL, bandera: '10-2', minimo: 4100, mediana: 4100, maximo: 4100, sucursales: 1 });
  });

  it('redondea la mediana a centavos', () => {
    const agg = createComercioAggregator(COMERCIO, SUCURSALES);
    agg.add(row({ idSucursal: '1', precioLista: '100.01' }));
    agg.add(row({ idSucursal: '2', precioLista: '100.02' }));
    expect(agg.finish().precios[0].mediana).toBe(100.02);
  });

  it('cuenta las filas leídas y las válidas', () => {
    const agg = toyComercio();
    agg.add(row({ productosEan: '0' }));
    const result = agg.finish();
    expect(result.filasLeidas).toBe(7);
    expect(result.filasValidas).toBe(6);
  });

  it('descarta filas con productos_ean distinto de 1', () => {
    const agg = createComercioAggregator(COMERCIO, SUCURSALES);
    agg.add(row({ idProducto: '2509964000005', productosEan: '0' }));
    expect(agg.finish().precios).toEqual([]);
  });

  it('descarta EAN que no tienen 13 dígitos o fallan el dígito verificador', () => {
    const agg = createComercioAggregator(COMERCIO, SUCURSALES);
    agg.add(row({ idProducto: '7791720048314' }));
    agg.add(row({ idProducto: '77956262' }));
    agg.add(row({ idProducto: '07791720048313' }));
    expect(agg.finish().precios).toEqual([]);
  });

  it('descarta precios de lista vacíos o <= 0', () => {
    const agg = createComercioAggregator(COMERCIO, SUCURSALES);
    agg.add(row({ precioLista: '' }));
    agg.add(row({ precioLista: '0.00' }));
    expect(agg.finish().precios).toEqual([]);
  });

  it('descarta filas de sucursales que no están en sucursales.csv', () => {
    const agg = createComercioAggregator(COMERCIO, SUCURSALES);
    agg.add(row({ idSucursal: '99' }));
    agg.add(row({ idBandera: '2', idSucursal: '1' }));
    expect(agg.finish().precios).toEqual([]);
  });

  it('descarta filas de banderas que no están en comercio.csv', () => {
    const agg = createComercioAggregator(COMERCIO, [...SUCURSALES, { idComercio: '10', idBandera: '3', idSucursal: '5' }]);
    agg.add(row({ idBandera: '3', idSucursal: '5' }));
    expect(agg.finish().precios).toEqual([]);
  });

  it('no devuelve las banderas sin ningún precio (Topsy, Bomba)', () => {
    const agg = createComercioAggregator(COMERCIO, SUCURSALES);
    agg.add(row({ idSucursal: '1' }));
    expect(agg.finish().banderas.map(b => b.id)).toEqual(['10-1']);
    expect(createComercioAggregator(COMERCIO, SUCURSALES).finish().banderas).toEqual([]);
  });
});

describe('createComercioAggregator: precios por sucursal (spec 13)', () => {
  // La bandera del ejemplo de la spec: 4 sucursales, $1.000 en la 1 y la 3, $1.200 en la 4, la 2 no informa
  const UNA_BANDERA: ComercioRow[] = [COMERCIO[0]];
  const CUATRO: SucursalRow[] = ['1', '2', '3', '4'].map(idSucursal => ({ idComercio: '10', idBandera: '1', idSucursal }));

  it('el ejemplo de la spec: precios = {1000, 1200}, indices = {1, 0, 1, 2}', () => {
    const agg = createComercioAggregator(UNA_BANDERA, CUATRO);
    agg.add(row({ idSucursal: '4', precioLista: '1200.00' }));
    agg.add(row({ idSucursal: '1', precioLista: '1000.00' }));
    agg.add(row({ idSucursal: '3', precioLista: '1000.00' }));
    const result = agg.finish();
    expect(result.preciosSucursal).toEqual([{ ean: MIX, bandera: '10-1', precios: [1000, 1200], indices: Int16Array.from([1, 0, 1, 2]) }]);
    expect(result.precios[0]).toMatchObject({ minimo: 1000, maximo: 1200, sucursales: 3 });
  });

  it('una sucursal sin productos se guarda igual y queda en 0 en todos los arreglos', () => {
    const agg = createComercioAggregator(UNA_BANDERA, CUATRO);
    agg.add(row({ idSucursal: '1', precioLista: '1000.00' }));
    const result = agg.finish();
    expect(result.sucursales.map(s => s.id)).toEqual(['10-1-1', '10-1-2', '10-1-3', '10-1-4']);
    expect(result.banderas[0].sucursales).toBe(4);
    expect(Array.from(result.preciosSucursal[0].indices)).toEqual([1, 0, 0, 0]);
  });

  it('un producto con un único precio en todas las sucursales', () => {
    const agg = createComercioAggregator(UNA_BANDERA, CUATRO);
    for (const idSucursal of ['1', '2', '3', '4']) agg.add(row({ idSucursal, precioLista: '2090.00' }));
    const [p] = agg.finish().preciosSucursal;
    expect(p.precios).toEqual([2090]);
    expect(Array.from(p.indices)).toEqual([1, 1, 1, 1]);
  });

  it('una sucursal que no está en sucursales.csv se descarta', () => {
    const agg = createComercioAggregator(UNA_BANDERA, CUATRO);
    agg.add(row({ idSucursal: '1', precioLista: '1000.00' }));
    agg.add(row({ idSucursal: '99', precioLista: '500.00' }));
    const [p] = agg.finish().preciosSucursal;
    expect(p.precios).toEqual([1000]);
    expect(p.indices).toHaveLength(4);
  });

  it('pos ordena las sucursales por id_sucursal, numérico, sin repetidas', () => {
    const agg = createComercioAggregator(UNA_BANDERA, [
      { idComercio: '10', idBandera: '1', idSucursal: '10' },
      { idComercio: '10', idBandera: '1', idSucursal: '9' },
      { idComercio: '10', idBandera: '1', idSucursal: '100' },
      { idComercio: '10', idBandera: '1', idSucursal: '9' },
    ]);
    agg.add(row({ idSucursal: '100' }));
    const result = agg.finish();
    expect(result.sucursales.map(s => [s.id, s.pos])).toEqual([['10-1-9', 1], ['10-1-10', 2], ['10-1-100', 3]]);
    expect(result.banderas[0].sucursales).toBe(3);
    expect(Array.from(result.preciosSucursal[0].indices)).toEqual([0, 0, 1]);
  });

  it('si una sucursal informa dos veces el mismo EAN, vale la primera fila', () => {
    const agg = createComercioAggregator(UNA_BANDERA, CUATRO);
    agg.add(row({ idSucursal: '1', precioLista: '1000.00' }));
    agg.add(row({ idSucursal: '1', precioLista: '1500.00' }));
    const result = agg.finish();
    expect(result.preciosSucursal[0].precios).toEqual([1000]);
    expect(result.precios[0]).toMatchObject({ minimo: 1000, maximo: 1000, sucursales: 1 });
  });

  it('las sucursales salen limpias, con coordenadas solo si son válidas', () => {
    const agg = createComercioAggregator(UNA_BANDERA, [
      {
        idComercio: '10', idBandera: '1', idSucursal: '1', nombre: 'CABALLITO  CENTRO', tipo: 'Hipermercado',
        calle: 'AV RIVADAVIA', numero: '5000', barrio: 'CABALLITO', localidad: 'CIUDAD DE BUENOS AIRES',
        provincia: 'AR-C', latitud: '-34,6188', longitud: '-58.4370',
      },
      { idComercio: '10', idBandera: '1', idSucursal: '2', nombre: '', calle: '', latitud: '0', longitud: '0' },
    ]);
    agg.add(row({ idSucursal: '1' }));
    const result = agg.finish();
    expect(result.sucursales).toEqual([
      {
        id: '10-1-1', bandera: '10-1', pos: 1, nombre: 'Caballito Centro', tipo: 'Hipermercado',
        direccion: 'Av Rivadavia 5000', barrio: 'Caballito', localidad: 'Ciudad De Buenos Aires', provincia: 'AR-C',
        lat: -34.6188, lng: -58.437,
      },
      {
        id: '10-1-2', bandera: '10-1', pos: 2, nombre: 'Sucursal 2', tipo: null, direccion: null, barrio: null,
        localidad: null, provincia: null, lat: null, lng: null,
      },
    ]);
    expect(result.sinCoordenadas).toBe(1);
  });

  it('las sucursales de una bandera sin precios no se devuelven', () => {
    const agg = createComercioAggregator(COMERCIO, SUCURSALES);
    agg.add(row({ idSucursal: '1' }));
    expect(agg.finish().sucursales.map(s => s.id)).toEqual(['10-1-1', '10-1-2']);
  });

  it('precios[1] = mínimo, el último = máximo, y los índices mayores a 0 = sucursales', () => {
    for (const { ean, bandera, minimo, maximo, sucursales } of toyComercio().finish().precios) {
      const p = toyComercio().finish().preciosSucursal.find(x => x.ean === ean && x.bandera === bandera)!;
      expect(p.precios[0]).toBe(minimo);
      expect(p.precios[p.precios.length - 1]).toBe(maximo);
      expect(Array.from(p.indices).filter(i => i > 0)).toHaveLength(sucursales);
    }
  });
});

describe('checkFreshness', () => {
  it('acepta un pie de hasta 7 días antes de la fecha del archivo', () => {
    expect(checkFreshness('2026-10-30', '2026-10-30')).toBeNull();
    expect(checkFreshness('2026-10-23', '2026-10-30')).toBeNull();
  });

  it('marca desactualizado un pie de más de 7 días (Unicoop)', () => {
    expect(checkFreshness('2026-10-22', '2026-10-30')).toBe('desactualizado');
    expect(checkFreshness('2025-06-11', '2026-10-30')).toBe('desactualizado');
  });

  it('sin pie con fecha → sin fecha de actualización', () => {
    expect(checkFreshness(null, '2026-10-30')).toBe('sin fecha de actualización');
  });
});

describe('createProductAccumulator', () => {
  it('elige la descripción más frecuente y colapsa los espacios repetidos', () => {
    const acc = createProductAccumulator();
    acc.merge(toyComercio().finish());
    const sal = acc.products().find(p => p.ean === SAL)!;
    expect(sal.descripcion).toBe('SAL FINA CELUSAL 250 G');
    expect(sal.marca).toBe('CELUSAL');
  });

  it('a igual cantidad, la primera en orden alfabético', () => {
    const agg = createComercioAggregator(COMERCIO, SUCURSALES);
    agg.add(row({ idSucursal: '1', descripcion: 'MIX CROCANTE X 40' }));
    agg.add(row({ idSucursal: '2', descripcion: 'MIX CARREFOUR 40 G' }));
    const acc = createProductAccumulator();
    acc.merge(agg.finish());
    expect(acc.products()[0].descripcion).toBe('MIX CARREFOUR 40 G');
  });

  it('presentación Carrefour 1 UNI / 40 GRM → 40 g', () => {
    const acc = createProductAccumulator();
    acc.merge(toyComercio().finish());
    const mix = acc.products().find(p => p.ean === MIX)!;
    expect(mix).toMatchObject({ cantidad: 40, unidad: 'g' });
  });

  it('gana la presentación más frecuente entre todas las filas del EAN', () => {
    const agg = createComercioAggregator(COMERCIO, SUCURSALES);
    agg.add(row({ idSucursal: '1' }));
    agg.add(row({ idSucursal: '2' }));
    agg.add(row({ idBandera: '2', idSucursal: '7', cantidadReferencia: '1', unidadReferencia: 'KGM' }));
    const acc = createProductAccumulator();
    acc.merge(agg.finish());
    expect(acc.products()[0]).toMatchObject({ cantidad: 40, unidad: 'g' });
  });

  it('sin presentación ni marca válidas quedan en null', () => {
    const agg = createComercioAggregator(COMERCIO, SUCURSALES);
    agg.add(row({ marca: '', cantidadPresentacion: '5', unidadPresentacion: 'MT', cantidadReferencia: '1', unidadReferencia: 'MT' }));
    const acc = createProductAccumulator();
    acc.merge(agg.finish());
    expect(acc.products()[0]).toMatchObject({ marca: null, cantidad: null, unidad: null });
  });

  it('suma las filas de varios comercios para elegir la descripción', () => {
    const dia = createComercioAggregator(
      [{ idComercio: '15', idBandera: '1', razonSocial: 'DIA Argentina S.A.', banderaNombre: 'Supermercados DIA' }],
      [{ idComercio: '15', idBandera: '1', idSucursal: '1' }, { idComercio: '15', idBandera: '1', idSucursal: '2' }],
    );
    dia.add({ ...sal('1', '1', 'SAL CELUSAL X250G', '4000.00'), idComercio: '15' });
    dia.add({ ...sal('1', '2', 'SAL CELUSAL X250G', '4050.00'), idComercio: '15' });

    const acc = createProductAccumulator();
    acc.merge(toyComercio().finish());
    acc.merge(dia.finish());
    // "SAL FINA CELUSAL 250 G": 2 filas (Carrefour); "SAL CELUSAL X250G": 1 (Carrefour) + 2 (DIA)
    expect(acc.products()).toHaveLength(2);
    expect(acc.products().find(p => p.ean === SAL)!.descripcion).toBe('SAL CELUSAL X250G');
  });

  it('un comercio que no se suma (desactualizado) no aporta productos', () => {
    const acc = createProductAccumulator();
    toyComercio().finish();
    expect(acc.products()).toEqual([]);
  });
});
