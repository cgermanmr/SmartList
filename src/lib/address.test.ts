import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AddressSuggestion, clearAddressCache, Department, formatStreet, nearestDepartments, numberAfterStreet,
  parseAddressQuery, parseDepartments, parseGeoref, parseReverse, reverseAddress, searchAddresses, suggestionDetail,
} from './address';

const PARQUE_PATRICIOS = { lat: -34.6365, lng: -58.4009 };
const OLIVOS = { lat: -34.5075, lng: -58.49 };
const LA_PLATA = { lat: -34.9214, lng: -57.9545 };

// ── Respuestas reales (25/11/2026) ────────────────────────────
// Cada fila: calle, altura, departamento, id y nombre de la localidad censal, provincia, lat, lon

type Row = [string, number | null, string, string, string, string, number | null, number | null];

const CABA = 'Ciudad Autónoma de Buenos Aires';

function georef(rows: Row[]) {
  return {
    cantidad: rows.length,
    direcciones: rows.map(([street, number, department, localityId, locality, province, lat, lon]) => ({
      altura: { valor: number },
      calle: { id: 'x', nombre: street },
      calle_cruce_1: { id: null, nombre: null },
      departamento: { nombre: department },
      localidad_censal: { id: localityId, nombre: locality },
      nomenclatura: `${street}, ${department}, ${province}`,
      provincia: { nombre: province },
      ubicacion: { lat, lon },
    })),
    inicio: 0,
    total: rows.length,
  };
}

/** direccion=Caseros en los departamentos más cercanos a Parque Patricios (una o dos cuadras de cada uno) */
const CASEROS_PP = georef([
  ['CASEROS', null, 'Avellaneda', '06035010', 'Avellaneda', 'Buenos Aires', -34.698507661178795, -58.3031794709512],
  ['AV CASEROS', null, 'Comuna 1', '02000010', CABA, CABA, -34.63402822192005, -58.389934164740396],
  ['AV CASEROS', null, 'Comuna 4', '02000010', CABA, CABA, -34.62669273113, -58.37175566376435],
  ['AV CASEROS', null, 'Comuna 4', '02000010', CABA, CABA, -34.6363516898708, -58.40130072960825],
  ['AV CASEROS', null, 'Comuna 5', '02000010', CABA, CABA, -34.63812917641235, -58.41144323297195],
]);

const CASEROS_OLIVOS = georef([
  ['CASEROS', null, 'Tres de Febrero', '06840010', 'Tres de Febrero', 'Buenos Aires', -34.6155337551632, -58.5680542459649],
  ['CASEROS', null, 'Vicente López', '06861010', 'Vicente López', 'Buenos Aires', -34.538709317627, -58.4783886087219],
  ['CASEROS', null, 'Vicente López', '06861010', 'Vicente López', 'Buenos Aires', -34.5107113055954, -58.49894900770774],
  ['655 CASEROS', null, 'Tres de Febrero', '06840010', 'Tres de Febrero', 'Buenos Aires', -34.60534996652915, -58.56740064678465],
  ['CASEROS', null, 'San Isidro', '06756010', 'San Isidro', 'Buenos Aires', -34.462536670271106, -58.50889325293485],
  ['AV CASEROS', null, 'Comuna 5', '02000010', CABA, CABA, -34.6400947076963, -58.4228990664789],
  ['CALLE 95 CASEROS', null, 'General San Martín', '06371010', 'General San Martín', 'Buenos Aires', -34.5687894741565, -58.55195075104161],
  ['DIAG 130 CASEROS', null, 'General San Martín', '06371010', 'General San Martín', 'Buenos Aires', -34.547226214480844, -58.56198143237621],
]);

/** direccion=Calle 7 800: Georef mezcla las calles que empiezan con 7 */
const CALLE_7_800 = georef([
  ['CALLE 70', 800, 'La Plata', '06441030', 'La Plata', 'Buenos Aires', -34.9321663630422, -57.9332515977344],
  ['CALLE 71', 800, 'La Plata', '06441030', 'La Plata', 'Buenos Aires', -34.9329900877701, -57.9321421080949],
  ['CALLE 73', 800, 'La Plata', '06441030', 'La Plata', 'Buenos Aires', -34.9349059082404, -57.9295442503644],
  ['CALLE 74', 800, 'La Plata', '06441030', 'La Plata', 'Buenos Aires', -34.9355490364598, -57.9286799816004],
  ['CALLE 75', 800, 'La Plata', '06441030', 'La Plata', 'Buenos Aires', -34.936165788084, -57.9278546635014],
  ['CALLE 78', 800, 'La Plata', '06441030', 'La Plata', 'Buenos Aires', -34.93452045393546, -57.92073575818747],
  ['CALLE 78 BIS', 800, 'La Plata', '06441030', 'La Plata', 'Buenos Aires', -34.936868534158734, -57.92231821154645],
  ['CALLE 7', 800, 'La Plata', '06441030', 'La Plata', 'Buenos Aires', -34.8549074667448, -58.0791703798797],
  ['CALLE 7', 800, 'Berazategui', '06091010', 'Berazategui', 'Buenos Aires', -34.77018510761457, -58.24291488802903],
]);

const CASEROS_2500: Row = ['AV CASEROS', 2500, 'Comuna 4', '02000010', CABA, CABA, -34.6356495919231, -58.3974323639265];
const CASEROS_2500_OLIVOS: Row =
  ['CASEROS', 2500, 'Vicente López', '06861010', 'Vicente López', 'Buenos Aires', -34.5218, -58.4921];

const DEPARTMENTS_RAW = {
  cantidad: 5,
  departamentos: [
    { centroide_lat: -34.6414, centroide_lon: -58.3903, id: '02028', nombre: 'Comuna 4' },
    { centroide_lat: -34.6135, centroide_lon: -58.4022, id: '02021', nombre: 'Comuna 3' },
    { centroide_lat: -34.6771, centroide_lon: -58.3415, id: '06035', nombre: 'Avellaneda' },
    { centroide_lat: -34.5211, centroide_lon: -58.5098, id: '06861', nombre: 'Vicente López' },
    { centroide_lat: -31.2902983724746, centroide_lon: -58.2378696898985, id: '30015', nombre: 'Concordia' },
  ],
};

// ── parseAddressQuery ────────────────────────────────────────

describe('parseAddressQuery', () => {
  it('separa el texto, la altura y la localidad que va después de la coma', () => {
    expect(parseAddressQuery('Caseros 2500, Olivos')).toEqual({ text: 'Caseros', number: '2500', locality: 'Olivos' });
  });

  it('sin coma ni número, solo texto y sin espacios de más', () => {
    expect(parseAddressQuery('  Av.   Caseros ')).toEqual({ text: 'Av. Caseros' });
  });

  it('usa la última coma, y una coma sin nada después no cuenta', () => {
    expect(parseAddressQuery('Caseros 2500, Olivos, Buenos Aires'))
      .toEqual({ text: 'Caseros 2500, Olivos', locality: 'Buenos Aires' });
    expect(parseAddressQuery('Caseros 2500, ')).toEqual({ text: 'Caseros', number: '2500' });
  });

  it('acepta "n°" y "al" antes de la altura', () => {
    expect(parseAddressQuery('Caseros n° 2500')).toEqual({ text: 'Caseros', number: '2500' });
    expect(parseAddressQuery('Caseros al 2500')).toEqual({ text: 'Caseros', number: '2500' });
  });

  it('el número de una calle numerada no es la altura', () => {
    expect(parseAddressQuery('Calle 7')).toEqual({ text: 'Calle 7' });
    expect(parseAddressQuery('Av. 7')).toEqual({ text: 'Av. 7' });
    expect(parseAddressQuery('Diag. 74')).toEqual({ text: 'Diag. 74' });
    expect(parseAddressQuery('Calle 7 800')).toEqual({ text: 'Calle 7', number: '800' });
    expect(parseAddressQuery('25 de Mayo')).toEqual({ text: '25 de Mayo' });
    expect(parseAddressQuery('2500')).toEqual({ text: '2500' });
  });
});

// ── numberAfterStreet ────────────────────────────────────────

describe('numberAfterStreet', () => {
  it('la altura escrita después de la calle elegida', () => {
    expect(numberAfterStreet('Av. Caseros 2500', 'Av. Caseros')).toBe('2500');
    expect(numberAfterStreet('av. caseros  2500 ', 'Av. Caseros')).toBe('2500');
    expect(numberAfterStreet('Calle 7 800', 'Calle 7')).toBe('800');
  });

  it('cadena vacía mientras solo está la calle', () => {
    expect(numberAfterStreet('Av. Caseros ', 'Av. Caseros')).toBe('');
    expect(numberAfterStreet('Av. Caseros', 'Av. Caseros')).toBe('');
  });

  it('null si cambió el nombre de la calle o hay algo más que un número', () => {
    expect(numberAfterStreet('Av. Caser', 'Av. Caseros')).toBeNull();
    expect(numberAfterStreet('Av. Caseros2', 'Av. Caseros')).toBeNull();
    expect(numberAfterStreet('Av. Caseros 2500, Olivos', 'Av. Caseros')).toBeNull();
    expect(numberAfterStreet('Calle 78', 'Calle 7')).toBeNull();
  });
});

// ── Departamentos ────────────────────────────────────────────

describe('parseDepartments', () => {
  it('pasa la respuesta de Georef a id y centro', () => {
    expect(parseDepartments(DEPARTMENTS_RAW)?.[0]).toEqual({ id: '02028', lat: -34.6414, lng: -58.3903 });
    expect(parseDepartments(DEPARTMENTS_RAW)).toHaveLength(5);
  });

  it('null si la respuesta no es válida o no trae ninguno', () => {
    expect(parseDepartments(null)).toBeNull();
    expect(parseDepartments({ departamentos: [] })).toBeNull();
    expect(parseDepartments({ departamentos: [{ id: 3 }, null] })).toBeNull();
  });
});

describe('nearestDepartments', () => {
  const departments: Department[] = [
    { id: 'lejos', lat: -31, lng: -58 }, { id: 'medio', lat: -34.5, lng: -58.5 }, { id: 'cerca', lat: -34.63, lng: -58.4 },
  ];

  it('los ids del más cercano al más lejano, hasta el máximo', () => {
    expect(nearestDepartments(departments, PARQUE_PATRICIOS)).toEqual(['cerca', 'medio', 'lejos']);
    expect(nearestDepartments(departments, PARQUE_PATRICIOS, 2)).toEqual(['cerca', 'medio']);
  });

  it('hasta 15 por defecto', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, lat: -34 - i / 10, lng: -58 }));
    expect(nearestDepartments(many, { lat: -34, lng: -58 })).toEqual(many.slice(0, 15).map(d => d.id));
  });
});

// ── formatStreet ─────────────────────────────────────────────

describe('formatStreet', () => {
  it.each([
    ['AV CASEROS', 'Av. Caseros'],
    ['CASEROS', 'Caseros'],
    ['DR RICARDO BALBIN', 'Dr. Ricardo Balbin'],
    ['AV GRL SAN MARTIN', 'Av. Gral. San Martin'],
    ['GRAL PAZ', 'Gral. Paz'],
    ['PTE J D PERON', 'Pte. J D Peron'],
    ['AV CNEL DIAZ', 'Av. Cnel. Diaz'],
    ['DIAG 130 CASEROS', 'Diag. 130 Caseros'],
    ['25 DE MAYO', '25 de Mayo'],
    ['R DE ESCALADA DE SAN MARTIN', 'R de Escalada de San Martin'],
    ['LA RIOJA', 'La Rioja'],
    ['VIRGEN DE LOS DOLORES', 'Virgen de los Dolores'],
    ["O'HIGGINS", "O'Higgins"],
    ['JUAN XXIII', 'Juan XXIII'],
    ['CALLE 78 BIS', 'Calle 78 Bis'],
    ['  ÑANDÚ   ÁLAMOS ', 'Ñandú Álamos'],
    ['JUNÍ­N', 'Junín'],
  ])('%s → %s', (raw, expected) => {
    expect(formatStreet(raw)).toBe(expected);
  });
});

// ── parseGeoref ──────────────────────────────────────────────

describe('parseGeoref', () => {
  it('en Parque Patricios la primera es Av. Caseros, con las cuadras y las comunas juntas en la más cercana', () => {
    const suggestions = parseGeoref(CASEROS_PP, PARQUE_PATRICIOS);
    expect(suggestions.map(s => [s.street, s.place])).toEqual([['Av. Caseros', 'CABA'], ['Caseros', 'Avellaneda, Buenos Aires']]);
    expect(suggestions[0]).toMatchObject({ locality: 'CABA', point: { lat: -34.6363516898708, lng: -58.40130072960825 } });
    expect(suggestions[0].number).toBeUndefined();
    expect(suggestions[0].distanceKm).toBeCloseTo(0.04, 2);
  });

  it('en Olivos la primera es Caseros, de Vicente López, y ofrece hasta 6', () => {
    const suggestions = parseGeoref(CASEROS_OLIVOS, OLIVOS);
    expect(suggestions[0]).toMatchObject({ street: 'Caseros', place: 'Vicente López, Buenos Aires', locality: 'Vicente López' });
    expect(suggestions.map(s => s.street)).toEqual([
      'Caseros', 'Caseros', 'Diag. 130 Caseros', 'Calle 95 Caseros', '655 Caseros', 'Caseros',
    ]);
  });

  it('con altura, la comuna o el partido y el punto', () => {
    expect(parseGeoref(georef([CASEROS_2500]), null)).toEqual([{
      street: 'Av. Caseros', number: '2500', place: 'Comuna 4, CABA', locality: 'CABA',
      point: { lat: -34.6356495919231, lng: -58.3974323639265 }, distanceKm: null,
    }]);
    expect(parseGeoref(georef([CASEROS_2500_OLIVOS]), null)[0].place).toBe('Vicente López, Buenos Aires');
  });

  it('con altura suma la localidad si no es la del partido, y no repite la de la provincia', () => {
    const [galvez, salta] = parseGeoref(georef([
      ['CASEROS', 2500, 'Rosario', '82084310', 'Villa Gobernador Gálvez', 'Santa Fe', -33.03, -60.63],
      ['CASEROS', 2500, 'Capital', '66028050', 'Salta', 'Salta', -24.78, -65.43],
    ]), null);
    expect(galvez.place).toBe('Villa Gobernador Gálvez, Rosario, Santa Fe');
    expect(salta.place).toBe('Capital, Salta');
  });

  it('sin referencia, el orden de Georef y sin distancia', () => {
    const suggestions = parseGeoref(CASEROS_PP, null);
    expect(suggestions.map(s => s.place)).toEqual(['Avellaneda, Buenos Aires', 'CABA']);
    expect(suggestions.every(s => s.distanceKm === null)).toBe(true);
  });

  it('acotada a una calle y su localidad, antes de cortar en 6', () => {
    const street: AddressSuggestion =
      { street: 'Calle 7', place: 'La Plata, Buenos Aires', locality: 'La Plata', point: null, distanceKm: null };
    expect(parseGeoref(CALLE_7_800, LA_PLATA).map(s => s.street)).not.toContain('Calle 7');
    expect(parseGeoref(CALLE_7_800, LA_PLATA, street)).toMatchObject([{ street: 'Calle 7', number: '800', locality: 'La Plata' }]);
  });

  it('acotada no mezcla localidades homónimas de otra provincia', () => {
    const street: AddressSuggestion =
      { street: 'Caseros', place: 'San José, Entre Ríos', locality: 'San José', point: null, distanceKm: null };
    const raw = georef([
      ['CASEROS', 100, 'Guaymallén', '50028020', 'San José', 'Mendoza', -32.9, -68.8],
      ['CASEROS', 100, 'Colón', '30008060', 'San José', 'Entre Ríos', -32.2, -58.2],
    ]);
    expect(parseGeoref(raw, null, street).map(s => s.place)).toEqual(['San José, Colón, Entre Ríos']);
  });

  it('una dirección sin ubicación queda sin punto, después de las que tienen distancia', () => {
    const suggestions = parseGeoref(georef([
      ['CASEROS', 10, 'Avellaneda', '06035010', 'Avellaneda', 'Buenos Aires', null, null], CASEROS_2500,
    ]), PARQUE_PATRICIOS);
    expect(suggestions.map(s => s.number)).toEqual(['2500', '10']);
    expect(suggestions[1]).toMatchObject({ point: null, distanceKm: null });
  });

  it('una respuesta inválida da lista vacía, y una fila inválida se saltea', () => {
    expect(parseGeoref(null, null)).toEqual([]);
    expect(parseGeoref({ direcciones: 'x' }, null)).toEqual([]);
    const raw = { direcciones: [null, {}, { calle: { nombre: null } }, ...georef([CASEROS_2500]).direcciones] };
    expect(parseGeoref(raw, null)).toHaveLength(1);
  });
});

describe('suggestionDetail', () => {
  const base: AddressSuggestion = { street: 'Av. Caseros', place: 'CABA', locality: 'CABA', point: null, distanceKm: null };

  it('el lugar y, con referencia, la distancia ("aprox." con localidad)', () => {
    expect(suggestionDetail(base, false)).toBe('CABA');
    expect(suggestionDetail({ ...base, distanceKm: 0.24 }, false)).toBe('CABA · a 250 m');
    expect(suggestionDetail({ ...base, distanceKm: 0.24 }, true)).toBe('CABA · aprox. a 250 m');
  });
});

// ── parseReverse ─────────────────────────────────────────────

describe('parseReverse', () => {
  it('calle, altura y barrio', () => {
    expect(parseReverse({
      address: {
        house_number: '2726', road: 'Avenida Caseros', suburb: 'Parque Patricios', city: 'Buenos Aires',
        state_district: 'Comuna 4', state: CABA, country_code: 'ar',
      },
    })).toEqual({ address: 'Avenida Caseros 2726', barrio: 'Parque Patricios' });
  });

  it('el primero que haya entre suburb, neighbourhood, town, village y city', () => {
    const barrio = (address: object) => parseReverse({ address: { road: 'Mitre', ...address } })?.barrio;
    expect(barrio({ neighbourhood: 'La Loma', city: 'La Plata' })).toBe('La Loma');
    expect(barrio({ town: 'Chascomús', city: 'X' })).toBe('Chascomús');
    expect(barrio({ village: 'Villa Elisa' })).toBe('Villa Elisa');
    expect(barrio({ city: 'La Plata' })).toBe('La Plata');
    expect(barrio({})).toBeUndefined();
  });

  it('sin altura queda la calle', () => {
    expect(parseReverse({ address: { road: 'Mitre' } })).toEqual({ address: 'Mitre' });
  });

  it('sin calle (una plaza, el mar) o inválida, null', () => {
    expect(parseReverse({ address: { city: 'La Plata' } })).toBeNull();
    expect(parseReverse({ error: 'Unable to geocode' })).toBeNull();
    expect(parseReverse({ address: { road: 5 } })).toBeNull();
    expect(parseReverse(null)).toBeNull();
  });
});

// ── Consultas (fetch simulado) ───────────────────────────────

const EMPTY = georef([]);

/** Responde según la URL y guarda las pedidas; respuesta undefined = falla de red */
function stubFetch(answer: (url: URL) => unknown) {
  const urls: URL[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    urls.push(url);
    const body = answer(url);
    if (body === undefined) throw new TypeError('Failed to fetch');
    return { ok: true, json: async () => body };
  }));
  return { urls, searches: () => urls.filter(u => u.pathname.endsWith('/direcciones')) };
}

/** Nunca responde; rechaza al cancelarse, como fetch */
function hang(signal?: AbortSignal | null): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
}

beforeEach(() => clearAddressCache());

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('searchAddresses', () => {
  const isDepartments = (url: URL) => url.pathname.endsWith('/departamentos');

  it('con referencia busca en los departamentos más cercanos, sin mandar ninguna coordenada', async () => {
    const { urls, searches } = stubFetch(url => (isDepartments(url) ? DEPARTMENTS_RAW : CASEROS_PP));
    const result = await searchAddresses('Caseros', PARQUE_PATRICIOS);
    expect(result).toMatchObject({ status: 'ok', unknownNumber: false });
    expect(result.status === 'ok' && result.suggestions[0].street).toBe('Av. Caseros');
    expect(searches()).toHaveLength(1);
    expect(searches()[0].searchParams.get('direccion')).toBe('Caseros');
    expect(searches()[0].searchParams.get('departamento')).toBe('02028,02021,06035,06861,30015');
    for (const url of urls) {
      const sent = decodeURIComponent(url.search).replace(/campos=[^&]*/, '');
      expect(sent).not.toMatch(/34\.|58\.|lat|lon|lng/i);
    }
  });

  it('los departamentos se piden una vez por sesión', async () => {
    const { urls } = stubFetch(url => (isDepartments(url) ? DEPARTMENTS_RAW : CASEROS_PP));
    await searchAddresses('Caseros', PARQUE_PATRICIOS);
    await searchAddresses('Av. Caseros', PARQUE_PATRICIOS);
    expect(urls.filter(isDepartments)).toHaveLength(1);
  });

  it('repetir el texto con los mismos departamentos no consulta de nuevo, y la distancia es la del origen nuevo', async () => {
    const { searches } = stubFetch(url => (isDepartments(url) ? DEPARTMENTS_RAW : georef([CASEROS_2500])));
    const first = await searchAddresses('Caseros 2500', PARQUE_PATRICIOS);
    const second = await searchAddresses('Caseros 2500', { lat: -34.6356495919231, lng: -58.3974323639265 });
    expect(searches()).toHaveLength(1);
    expect(first.status === 'ok' && first.suggestions[0].distanceKm).toBeGreaterThan(0.3);
    expect(second.status === 'ok' && second.suggestions[0].distanceKm).toBe(0);
  });

  it('sin referencia busca en todo el país, sin pedir los departamentos', async () => {
    const { urls } = stubFetch(() => CASEROS_PP);
    await searchAddresses('Caseros', null);
    expect(urls).toHaveLength(1);
    expect(urls[0].searchParams.has('departamento')).toBe(false);
  });

  it('sin resultados cerca busca en todo el país', async () => {
    const { searches } = stubFetch(url => {
      if (isDepartments(url)) return DEPARTMENTS_RAW;
      return url.searchParams.has('departamento') ? EMPTY : georef([CASEROS_2500_OLIVOS]);
    });
    const result = await searchAddresses('Caseros 2500', PARQUE_PATRICIOS);
    expect(searches().map(u => u.searchParams.has('departamento'))).toEqual([true, false]);
    expect(result).toMatchObject({ status: 'ok', unknownNumber: false, suggestions: [{ street: 'Caseros' }] });
  });

  it('si fallan los departamentos busca en todo el país, y los vuelve a pedir la próxima vez', async () => {
    const { urls, searches } = stubFetch(url => (isDepartments(url) ? undefined : CASEROS_PP));
    expect(await searchAddresses('Caseros', PARQUE_PATRICIOS)).toMatchObject({ status: 'ok' });
    expect(searches()[0].searchParams.has('departamento')).toBe(false);
    await searchAddresses('Otra', PARQUE_PATRICIOS);
    expect(urls.filter(isDepartments)).toHaveLength(2);
  });

  it('con coma busca en esa localidad, sin mirar la cercanía', async () => {
    const { urls } = stubFetch(() => georef([CASEROS_2500_OLIVOS]));
    const result = await searchAddresses('Caseros 2500, Olivos', PARQUE_PATRICIOS);
    expect(urls).toHaveLength(1);
    expect(urls[0].searchParams.get('direccion')).toBe('Caseros 2500');
    expect(urls[0].searchParams.get('localidad')).toBe('Olivos');
    expect(result).toMatchObject({ status: 'ok', suggestions: [{ street: 'Caseros', number: '2500' }] });
  });

  it('con coma y sin resultados en la localidad, busca en ese departamento', async () => {
    const { urls } = stubFetch(url => (url.searchParams.has('localidad') ? EMPTY : georef([CASEROS_2500_OLIVOS])));
    await searchAddresses('Caseros 2500, Vicente López', null);
    expect(urls.map(u => u.searchParams.get('departamento'))).toEqual([null, 'Vicente López']);
  });

  it('"Capital Federal" se busca como CABA', async () => {
    const { urls } = stubFetch(() => georef([CASEROS_2500]));
    await searchAddresses('Caseros 2500, capital federal', null);
    await searchAddresses('Caseros 2501, Ciudad Autonoma de Buenos Aires', null);
    expect(urls.map(u => u.searchParams.get('localidad'))).toEqual(['CABA', 'CABA']);
  });

  it('si la altura no existe ofrece las calles', async () => {
    const { searches } = stubFetch(url => {
      if (isDepartments(url)) return DEPARTMENTS_RAW;
      return url.searchParams.get('direccion') === 'Caseros' ? CASEROS_PP : EMPTY;
    });
    const result = await searchAddresses('Caseros 99999', PARQUE_PATRICIOS);
    expect(result).toMatchObject({ status: 'ok', unknownNumber: true });
    expect(result.status === 'ok' && result.suggestions.map(s => s.street)).toEqual(['Av. Caseros', 'Caseros']);
    expect(searches().map(u => u.searchParams.get('direccion'))).toEqual(['Caseros 99999', 'Caseros 99999', 'Caseros']);
  });

  it('sin la calle ni la altura, sin resultados (no es una altura inexistente)', async () => {
    stubFetch(() => EMPTY);
    expect(await searchAddresses('asdf 300', null)).toEqual({ status: 'ok', suggestions: [], unknownNumber: false });
  });

  it('acotada a la calle elegida: busca en su localidad y descarta las demás calles', async () => {
    const { urls } = stubFetch(() => CALLE_7_800);
    const street: AddressSuggestion =
      { street: 'Calle 7', place: 'La Plata, Buenos Aires', locality: 'La Plata', point: null, distanceKm: null };
    const result = await searchAddresses('Calle 7 800', LA_PLATA, street);
    expect(urls[0].searchParams.get('localidad')).toBe('La Plata');
    expect(result.status === 'ok' && result.suggestions.map(s => s.street)).toEqual(['Calle 7']);
  });

  it('falla sin conexión, con un error del servidor o con una respuesta inválida, y no se guarda', async () => {
    stubFetch(() => undefined);
    expect(await searchAddresses('Caseros', null)).toEqual({ status: 'failed' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => CASEROS_PP })));
    expect(await searchAddresses('Caseros', null)).toEqual({ status: 'failed' });
    stubFetch(() => ({ errores: [] }));
    expect(await searchAddresses('Caseros', null)).toEqual({ status: 'failed' });
    stubFetch(() => CASEROS_PP);
    expect(await searchAddresses('Caseros', null)).toMatchObject({ status: 'ok' });
  });

  it('falla a los 5 segundos', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_: string, init?: RequestInit) => hang(init?.signal)));
    const done = vi.fn();
    void searchAddresses('Caseros', null).then(done);
    await vi.advanceTimersByTimeAsync(4_900);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toHaveBeenCalledWith({ status: 'failed' });
  });

  it('los 5 segundos son de toda la búsqueda, no de cada consulta', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_: string, init?: RequestInit) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ ok: true, json: async () => EMPTY }), 3_000);
      init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('abort')); });
    })));
    const done = vi.fn();
    void searchAddresses('Caseros 2500, Olivos', null).then(done);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(done).toHaveBeenCalledWith({ status: 'failed' });
  });

  it('unos departamentos que no responden no frenan la búsqueda: va a todo el país', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => (
      url.includes('/departamentos') ? hang(init?.signal) : Promise.resolve({ ok: true, json: async () => CASEROS_PP })
    )));
    const done = vi.fn();
    void searchAddresses('Caseros', PARQUE_PATRICIOS).then(done);
    await vi.advanceTimersByTimeAsync(4_900);
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));
  });
});

describe('reverseAddress', () => {
  const REVERSE = { address: { road: 'Avenida Caseros', house_number: '2726', suburb: 'Parque Patricios' } };

  it('consulta Nominatim con el punto', async () => {
    const { urls } = stubFetch(() => REVERSE);
    expect(await reverseAddress(PARQUE_PATRICIOS)).toEqual({ address: 'Avenida Caseros 2726', barrio: 'Parque Patricios' });
    expect(urls[0].hostname).toBe('nominatim.openstreetmap.org');
    expect(urls[0].searchParams.get('lat')).toBe('-34.63650');
    expect(urls[0].searchParams.get('lon')).toBe('-58.40090');
  });

  it('null si falla, si no hay calle o a los 8 segundos', async () => {
    stubFetch(() => undefined);
    expect(await reverseAddress(PARQUE_PATRICIOS)).toBeNull();
    stubFetch(() => ({ error: 'Unable to geocode' }));
    expect(await reverseAddress(PARQUE_PATRICIOS)).toBeNull();

    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_: string, init?: RequestInit) => hang(init?.signal)));
    const done = vi.fn();
    void reverseAddress(PARQUE_PATRICIOS).then(done);
    await vi.advanceTimersByTimeAsync(7_900);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toHaveBeenCalledWith(null);
  });

  it('nunca dos a la vez: la segunda cancela la primera', async () => {
    const signals: AbortSignal[] = [];
    let first = true;
    vi.stubGlobal('fetch', vi.fn((_: string, init: RequestInit) => {
      signals.push(init.signal!);
      if (!first) return Promise.resolve({ ok: true, json: async () => REVERSE });
      first = false;
      return hang(init.signal);
    }));
    const canceled = reverseAddress(PARQUE_PATRICIOS);
    const answered = reverseAddress(OLIVOS);
    expect(await canceled).toBeNull();
    expect(await answered).not.toBeNull();
    expect(signals.map(s => s.aborted)).toEqual([true, false]);
  });
});
