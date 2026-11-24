import { describe, expect, it } from 'vitest';
import { CartItem, Price, Product, StoreRef } from './models';
import type { SepaBranch, SepaProduct } from './sepa';
import {
  decodeSharedCart, encodeSharedCart, findSharedPayload, localIsoDate, MAX_SHARED_ITEMS, resolveSharedCart, SharedCart,
  sharedCartUrl, SharedContext, sharedFromItems, SharedItem, sharedItemName, shareMessage,
} from './shared-cart';

/** EAN-13 válido a partir de sus 12 primeros dígitos */
function ean(body: string): string {
  const digits = body.padStart(12, '0');
  const sum = [...digits].reduce((total, d, i) => total + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return digits + ((10 - (sum % 10)) % 10);
}

const LECHE = ean('779074233450');
const YERBA = ean('779370400091');
const COTO = { name: 'Coto — Caballito', sepaId: '12-1-45' };

function cartOf(items: SharedItem[]): SharedCart {
  return { kind: 'cart', items };
}

function roundTrip(cart: SharedCart): SharedCart {
  const result = decodeSharedCart(encodeSharedCart(cart));
  if (!result.ok) throw new Error(result.error);
  return result.cart;
}

function errorOf(payload: string): string | null {
  const result = decodeSharedCart(payload);
  return result.ok ? null : result.error;
}

// ── Ida y vuelta ────────────────────────────────────────────
describe('encodeSharedCart y decodeSharedCart', () => {
  it('conservan productos, cantidades, precios y comercios', () => {
    const cart = cartOf([
      { ean: LECHE, quantity: 2, price: 1600, store: COTO },
      { ean: YERBA, quantity: 1, price: 4950.5, store: { name: 'Almacén de Ñata', barrio: 'Villa Crespo', address: 'Av. Corrientes 5000' } },
      { name: 'Pan lactal', quantity: 1 },
    ]);
    expect(roundTrip(cart)).toEqual(cart);
  });

  it('conservan un comercio con dirección y sin barrio', () => {
    const cart = cartOf([{ ean: LECHE, quantity: 1, store: { name: 'Kiosco', address: 'Yatay 10' } }]);
    expect(roundTrip(cart)).toEqual(cart);
  });

  it('conservan la fecha de una compra', () => {
    const cart: SharedCart = { kind: 'purchase', date: '2026-11-12', items: [{ ean: LECHE, quantity: 1, price: 10 }] };
    expect(roundTrip(cart)).toEqual(cart);
  });

  it('conservan acentos, ñ, emojis y signos', () => {
    const cart = cartOf([{ name: 'Ñoquis «caseros» 🥔 - 1/2 kg. ¡Rápido!', quantity: 1 }]);
    expect(roundTrip(cart)).toEqual(cart);
  });

  it('conservan los ceros a la izquierda del EAN', () => {
    const cart = cartOf([{ ean: ean('000001234567'), quantity: 1 }]);
    expect(roundTrip(cart)).toEqual(cart);
  });

  it('conservan cantidades con hasta 3 decimales', () => {
    const cart = cartOf([{ ean: LECHE, quantity: 0.125 }, { ean: YERBA, quantity: 9999 }]);
    expect(roundTrip(cart)).toEqual(cart);
  });

  it('un comercio repetido viaja una sola vez', () => {
    const payload = encodeSharedCart(cartOf([
      { ean: LECHE, quantity: 1, store: COTO }, { ean: YERBA, quantity: 1, store: { ...COTO } },
    ]));
    expect(payload.split('.').filter(record => record.startsWith('s-'))).toHaveLength(1);
  });

  it('dos comercios con el mismo nombre en distinto barrio no se mezclan', () => {
    const cart = cartOf([
      { ean: LECHE, quantity: 1, store: { name: 'Día', barrio: 'Once' } },
      { ean: YERBA, quantity: 1, store: { name: 'Día', barrio: 'Flores' } },
    ]);
    expect(roundTrip(cart)).toEqual(cart);
  });

  it('el link solo tiene letras, dígitos, puntos y guiones', () => {
    const payload = encodeSharedCart(cartOf([
      { name: 'Café_*tostado*~ / "ñ" 🥔', quantity: 0.5, price: 99.99, store: { name: 'Lo de José & Cía.', address: 'Bv. 9 #12' } },
    ]));
    expect(payload).toMatch(/^[0-9A-Za-z.-]+$/);
  });

  it('20 productos del catálogo en un comercio entran en menos de 600 caracteres', () => {
    const items = Array.from({ length: 20 }, (_, i): SharedItem => ({
      ean: ean(`7790000000${i + 10}`), quantity: 12, price: 12345.67,
      store: { name: 'Hipermercado Carrefour — San Isidro', sepaId: '10-1-1234' },
    }));
    expect(sharedCartUrl(cartOf(items)).length).toBeLessThan(600);
  });

  it('el link es siempre el de producción', () => {
    const url = sharedCartUrl(cartOf([{ ean: LECHE, quantity: 1 }]));
    expect(url.startsWith('https://elchanguito.vercel.app/cart/compartido#1c.')).toBe(true);
  });

  it('un producto en $0 llega sin precio', () => {
    expect(roundTrip(cartOf([{ ean: LECHE, quantity: 1, price: 0 }])).items[0]).toEqual({ ean: LECHE, quantity: 1 });
  });
});

// ── Links que no se pueden abrir ────────────────────────────
describe('decodeSharedCart', () => {
  const payload = encodeSharedCart(cartOf([
    { ean: LECHE, quantity: 2, price: 1600, store: COTO },
    { name: 'Pan lactal', quantity: 1, price: 2100 },
  ]));

  it('cortado en cualquier punto dice que está incompleto', () => {
    expect(payload.length).toBeGreaterThan(50);
    for (let length = 2; length < payload.length; length++) {
      expect(errorOf(payload.slice(0, length)), payload.slice(0, length)).toBe('incomplete');
    }
  });

  it('con un producto de menos respecto del cierre está incompleto', () => {
    const records = payload.split('.');
    records.splice(records.findIndex(record => record.startsWith('i-')), 1);
    expect(errorOf(records.join('.'))).toBe('incomplete');
  });

  it('un punto final (fin de frase) no molesta', () => {
    expect(errorOf(`${payload}.`)).toBeNull();
  });

  it.each(['2c.x-1.e-1', '12c.e-1', '3'])('%s es de otra versión', text => {
    expect(errorOf(text)).toBe('version');
  });

  it.each([
    ['vacío', () => ''],
    ['cualquier texto', () => 'hola'],
    ['con otros caracteres', () => payload.replace('.', '_')],
    ['con porcentajes', () => '%E0%A4%A'],
    ['otro tipo', () => payload.replace('1c', '1x')],
    ['un carrito con fecha', () => payload.replace('1c', `1c-${(20261112).toString(36)}`)],
    ['un registro desconocido', () => payload.replace('.e-', '.z-1.e-')],
    ['una compra sin fecha', () => payload.replace('1c', '1p')],
    ['una compra con una fecha imposible', () => payload.replace('1c', `1p-${(20261341).toString(36)}`)],
  ])('%s no es válido', (_title, text) => {
    expect(errorOf(text())).toBe('invalid');
  });

  // Registros armados a mano: cada uno con un solo dato fuera de los límites
  const b36 = (n: number) => n.toString(36);
  const LECHE36 = b36(Number(LECHE));
  it.each([
    ['un EAN con mal dígito verificador', `i-${b36(Number(LECHE) + 1)}-rs`],
    ['un EAN demasiado largo', `i-${b36(1e14)}-rs`],
    ['cantidad 0', `i-${LECHE36}-0`],
    ['sin cantidad', `i-${LECHE36}`],
    ['más de 9.999', `i-${LECHE36}-${b36(9_999_001)}`],
    ['precio de más de 100.000.000', `i-${LECHE36}-rs-${b36(10_000_000_001)}`],
    ['un número en mayúsculas', `i-${LECHE36}-RS`],
    ['un comercio que no existe', `i-${LECHE36}-rs--1`],
    ['comercio 0', `i-${LECHE36}-rs--0`],
    ['sin EAN ni nombre', 'i--rs'],
    ['un campo de más', `i-${LECHE36}-rs----1`],
    ['un nombre que no es UTF-8', 'i--rs---zzzzzzz'],
    ['un nombre larguísimo', `i--rs---${'z'.repeat(50_000)}`],
    ['un comercio sin nombre', `s--1.i-${LECHE36}-rs--1`],
  ])('%s invalida el link', (_title, record) => {
    expect(errorOf(`1c.${record}.e-1`)).toBe('invalid');
  });

  it('acepta los topes de cantidad y de precio', () => {
    expect(errorOf(`1c.i-${LECHE36}-${b36(9_999_000)}-${b36(10_000_000_000)}.e-1`)).toBeNull();
  });

  it('acepta un texto de 200 caracteres y no uno de 201 ni uno en blanco', () => {
    const named = (name: string) => encodeSharedCart(cartOf([{ name, quantity: 1 }]));
    expect(errorOf(named('ñ'.repeat(200)))).toBeNull();
    expect(errorOf(named('ñ'.repeat(201)))).toBe('invalid');
    expect(errorOf(named('   '))).toBe('invalid');
  });

  it('un sepaId con otra forma invalida el link', () => {
    expect(errorOf(encodeSharedCart(cartOf([{ ean: LECHE, quantity: 1, store: { name: 'Coto', sepaId: 'x-1-1' } }])))).toBe('invalid');
  });

  it(`hasta ${MAX_SHARED_ITEMS} productos; con uno más o con ninguno no es válido`, () => {
    const items = Array.from({ length: MAX_SHARED_ITEMS + 1 }, (_, i): SharedItem => ({ ean: ean(String(1000 + i)), quantity: 1 }));
    expect(errorOf(encodeSharedCart(cartOf(items.slice(0, MAX_SHARED_ITEMS))))).toBeNull();
    expect(errorOf(encodeSharedCart(cartOf(items)))).toBe('invalid');
    expect(errorOf('1c.e-0')).toBe('invalid');
  });
});

// ── Buscar el link en un texto pegado ───────────────────────
describe('findSharedPayload', () => {
  it.each([
    ['el link solo', 'https://elchanguito.vercel.app/cart/compartido#1c.i-abc-rs.e-1'],
    ['el mensaje entero', '🛒 *Mi carrito*\n\nCargalo en El Changuito:\nhttps://elchanguito.vercel.app/cart/compartido#1c.i-abc-rs.e-1\n'],
    ['otro dominio', 'mirá http://localhost:4200/cart/compartido#1c.i-abc-rs.e-1 dale'],
    ['sin dominio y con barra', '/cart/compartido/#1c.i-abc-rs.e-1'],
  ])('lo encuentra en %s', (_title, text) => {
    expect(findSharedPayload(text)).toBe('1c.i-abc-rs.e-1');
  });

  it.each(['', 'hola', 'https://elchanguito.vercel.app/cart', 'https://elchanguito.vercel.app/cart/compartido', '/cart/compartido#'])(
    'sin link en %j da null', text => {
      expect(findSharedPayload(text)).toBeNull();
    },
  );
});

// ── Del carrito a lo que se comparte ────────────────────────
describe('sharedFromItems', () => {
  const products: Product[] = [
    { id: 'leche', name: 'Leche entera 1 l', ean: LECHE },
    { id: 'yerba', name: 'Yerba', ean: YERBA },
    { id: 'pan', name: 'Pan lactal' },
  ];
  const inCatalog = (code: string) => code === LECHE;

  function cartItem(productId: string, patch: Partial<CartItem> = {}): CartItem {
    return { id: `i-${productId}`, productId, productName: `Nombre de ${productId}`, price: 100, quantity: 1, subtotal: 100, ...patch };
  }

  it('un producto del catálogo viaja solo con el EAN', () => {
    expect(sharedFromItems([cartItem('leche')], products, inCatalog)).toEqual([{ ean: LECHE, quantity: 1, price: 100 }]);
  });

  it('con EAN pero sin referencia viaja también el nombre', () => {
    expect(sharedFromItems([cartItem('yerba')], products, inCatalog))
      .toEqual([{ ean: YERBA, name: 'Nombre de yerba', quantity: 1, price: 100 }]);
  });

  it('sin EAN, o si el producto ya no existe, viaja el nombre', () => {
    expect(sharedFromItems([cartItem('pan'), cartItem('borrado')], products, inCatalog)).toEqual([
      { name: 'Nombre de pan', quantity: 1, price: 100 }, { name: 'Nombre de borrado', quantity: 1, price: 100 },
    ]);
  });

  it('un ítem en $0 viaja sin precio y el precio se redondea a centavos', () => {
    const [free, rounded] = sharedFromItems(
      [cartItem('leche', { price: 0 }), cartItem('leche', { price: 10.006 })], products, inCatalog,
    );
    expect(free).toEqual({ ean: LECHE, quantity: 1 });
    expect(rounded.price).toBe(10.01);
  });

  it('de un comercio de Precios Claros viajan nombre y sepaId', () => {
    const store: StoreRef = {
      name: 'Coto — Caballito', sepaId: '12-1-45', chain: 'Coto', address: 'Rivadavia 1', barrio: 'Caballito', lat: -34, lng: -58,
    };
    expect(sharedFromItems([cartItem('leche', { store })], products, inCatalog)[0].store)
      .toEqual({ name: 'Coto — Caballito', sepaId: '12-1-45' });
  });

  it('de un comercio a mano viajan nombre, barrio y dirección, nunca las coordenadas', () => {
    const store: StoreRef = { name: 'Almacén', barrio: 'Once', address: 'Pueyrredón 1', lat: -34.6041, lng: -58.4057 };
    const shared = sharedFromItems([cartItem('leche', { store })], products, inCatalog);
    expect(shared[0].store).toEqual({ name: 'Almacén', barrio: 'Once', address: 'Pueyrredón 1' });
  });

  it('lo que sale siempre se puede volver a abrir, también con textos larguísimos o fuera de rango', () => {
    const shared = sharedFromItems([
      cartItem('pan', { productName: ` ${'🥖'.repeat(300)}\n`, quantity: 123_456, store: { name: 'x'.repeat(250), barrio: '  ' } }),
      cartItem('pan', { quantity: 0.0001, price: 1e12, store: { name: ' ' } }),
      cartItem('pan', { productName: '  ', store: { name: 'Coto', sepaId: 'raro' } }),
    ], products, inCatalog);
    expect(decodeSharedCart(encodeSharedCart(cartOf(shared)))).toEqual({ ok: true, cart: cartOf(shared) });
    expect(shared[0].quantity).toBe(9999);
    expect(shared[1]).toEqual({ name: 'Nombre de pan', quantity: 0.001 });
    expect(shared[2]).toEqual({ name: 'Producto', quantity: 1, price: 100, store: { name: 'Coto' } });
  });
});

// ── Mensaje ─────────────────────────────────────────────────
describe('shareMessage', () => {
  const leche: SharedItem = { ean: LECHE, quantity: 2, price: 1600, store: COTO };
  const yerba: SharedItem = { ean: YERBA, quantity: 1, price: 4950, store: COTO };
  const pan: SharedItem = { name: 'Pan lactal', quantity: 1, price: 2100 };
  const jabon: SharedItem = { name: 'Jabón', quantity: 1 };

  it('agrupa por comercio, con subtotales, total y "Sin comercio" al final', () => {
    const text = shareMessage(
      cartOf([pan, leche, yerba, jabon]), ['Pan lactal', 'Leche entera 1 l', 'Yerba Playadito 1 kg', 'Jabón'],
    );
    expect(text).toBe([
      '🛒 *Mi carrito* (4 productos)',
      '',
      '*Coto — Caballito* · $8.150,00',
      '• 2 × Leche entera 1 l · $3.200,00',
      '• 1 × Yerba Playadito 1 kg · $4.950,00',
      '',
      '*Sin comercio* · $2.100,00',
      '• 1 × Pan lactal · $2.100,00',
      '• 1 × Jabón · sin precio',
      '',
      '*Total: $10.250,00*',
      '',
      'Cargalo en El Changuito:',
    ].join('\n'));
  });

  it('con un solo comercio va en el título, sin encabezado ni subtotal', () => {
    expect(shareMessage(cartOf([leche, yerba]), ['Leche', 'Yerba'])).toBe([
      '🛒 *Mi carrito en Coto — Caballito* (2 productos)',
      '',
      '• 2 × Leche · $3.200,00',
      '• 1 × Yerba · $4.950,00',
      '',
      '*Total: $8.150,00*',
      '',
      'Cargalo en El Changuito:',
    ].join('\n'));
  });

  it('solo "Sin comercio" no lleva encabezado; con uno, "1 producto"', () => {
    expect(shareMessage(cartOf([pan]), ['Pan lactal'])).toBe(
      '🛒 *Mi carrito* (1 producto)\n\n• 1 × Pan lactal · $2.100,00\n\n*Total: $2.100,00*\n\nCargalo en El Changuito:',
    );
  });

  it('una compra lleva su fecha y "Cargala"', () => {
    const text = shareMessage({ kind: 'purchase', date: '2026-11-12', items: [leche, yerba] }, ['Leche', 'Yerba']);
    expect(text).toContain('🛒 *Compra del 12/11/2026 en Coto — Caballito* (2 productos)');
    expect(text.endsWith('\n\nCargala en El Changuito:')).toBe(true);
  });

  it('las cantidades van con hasta 3 decimales', () => {
    expect(shareMessage(cartOf([{ ...pan, quantity: 0.5 }]), ['Pan'])).toContain('• 0,5 × Pan · $1.050,00');
  });

  it('saca los caracteres de formato de WhatsApp y los saltos de línea', () => {
    const text = shareMessage(cartOf([{ ...pan, store: { name: 'Lo de *José*' } }]), ['Pan_de~molde`\nblanco']);
    expect(text).toContain('🛒 *Mi carrito en Lo de José* (1 producto)');
    expect(text).toContain('• 1 × Pan de molde blanco · $2.100,00');
  });

  it('con 40 productos los lista todos', () => {
    const items = Array.from({ length: 40 }, () => pan);
    const text = shareMessage(cartOf(items), items.map(() => 'Pan'));
    expect(text.match(/•/g)).toHaveLength(40);
    expect(text).not.toContain('más');
  });

  it('con más de 40 lista 40 y cuenta el resto; subtotales y total son de todos', () => {
    const items = [...Array.from({ length: 30 }, () => leche), ...Array.from({ length: 11 }, () => pan)];
    const text = shareMessage(cartOf(items), items.map(() => 'Algo'));
    expect(text.match(/•/g)).toHaveLength(40);
    expect(text).toContain('(41 productos)');
    expect(text).toContain('\n\ny 1 producto más\n\n');
    expect(text).toContain('*Sin comercio* · $23.100,00');
    expect(text).toContain('*Total: $119.100,00*');
  });

  it('un comercio sin productos en la lista no deja un encabezado vacío', () => {
    const items = [...Array.from({ length: 40 }, () => leche), pan, pan];
    const text = shareMessage(cartOf(items), items.map(() => 'Algo'));
    expect(text).not.toContain('Sin comercio');
    expect(text).toContain('y 2 productos más');
  });
});

// ── De un link al carrito propio ────────────────────────────
describe('resolveSharedCart', () => {
  const sepaLeche: SepaProduct = { ean: LECHE, description: 'LECHE ENTERA SERENISIMA', brand: 'SERENISIMA', size: 1000, sizeUnit: 'ml', banderas: 5 };
  const branch: SepaBranch = {
    id: '12-1-45', chain: 'Coto', name: 'Caballito', address: 'Rivadavia 5000', barrio: 'Caballito', localidad: null,
    provincia: 'AR-C', lat: -34.6, lng: -58.4, updated: '2026-11-20',
  };

  function context(patch: Partial<SharedContext> = {}): SharedContext {
    let next = 0;
    return {
      products: [], prices: [], catalog: new Map(), branches: [], references: new Map(), newId: () => `n${++next}`, ...patch,
    };
  }

  function price(productId: string, amount: number): Price {
    return { id: `p-${productId}`, productId, amount, date: new Date('2026-11-01T12:00:00Z'), barrio: 'Once' };
  }

  describe('producto', () => {
    it('usa el propio con ese EAN', () => {
      const load = resolveSharedCart(cartOf([{ ean: LECHE, quantity: 2, price: 50 }]), context({
        products: [{ id: 'mio', name: 'Mi leche', ean: LECHE }], catalog: new Map([[LECHE, sepaLeche]]),
      }));
      expect(load.products).toEqual([]);
      expect(load.items).toEqual([{ id: 'n1', productId: 'mio', productName: 'Mi leche', price: 50, quantity: 2, subtotal: 100 }]);
    });

    it('si no lo tiene lo crea desde el catálogo, sin categoría', () => {
      const load = resolveSharedCart(
        cartOf([{ ean: LECHE, name: 'Otro nombre', quantity: 1 }]), context({ catalog: new Map([[LECHE, sepaLeche]]) }),
      );
      expect(load.products).toEqual([
        { id: 'n1', name: 'Leche Entera', ean: LECHE, brand: 'SERENISIMA', size: 1000, sizeUnit: 'ml' },
      ]);
      expect(load.items[0]).toMatchObject({ productId: 'n1', productName: 'Leche Entera' });
    });

    it('fuera del catálogo lo crea con el nombre del link y su EAN', () => {
      expect(resolveSharedCart(cartOf([{ ean: LECHE, name: 'Leche rara', quantity: 1 }]), context()).products)
        .toEqual([{ id: 'n1', name: 'Leche rara', ean: LECHE }]);
    });

    it('sin nombre en ningún lado es "Producto <EAN>"', () => {
      expect(resolveSharedCart(cartOf([{ ean: LECHE, quantity: 1 }]), context()).products)
        .toEqual([{ id: 'n1', name: `Producto ${LECHE}`, ean: LECHE }]);
    });

    it('sin EAN usa el propio sin EAN con el mismo nombre, sin mayúsculas ni espacios de más', () => {
      const load = resolveSharedCart(cartOf([{ name: 'PAN  lactal', quantity: 1, price: 10 }]), context({
        products: [{ id: 'con-ean', name: 'Pan lactal', ean: YERBA }, { id: 'pan', name: ' Pan Lactal ' }],
      }));
      expect(load.products).toEqual([]);
      expect(load.items[0].productId).toBe('pan');
    });

    it('sin EAN y sin uno igual lo crea solo con el nombre', () => {
      const load = resolveSharedCart(cartOf([{ name: 'Pan lactal', quantity: 1 }]), context({
        products: [{ id: 'con-ean', name: 'Pan lactal', ean: YERBA }],
      }));
      expect(load.products).toEqual([{ id: 'n1', name: 'Pan lactal' }]);
    });

    it('dos ítems del mismo producto se suman con el comercio y el precio del primero', () => {
      const load = resolveSharedCart(cartOf([
        { name: 'Pan', quantity: 1, price: 100, store: { name: 'Día' } },
        { name: 'pan', quantity: 2, price: 80, store: { name: 'Coto' } },
      ]), context());
      expect(load.products).toHaveLength(1);
      expect(load.items).toHaveLength(1);
      expect(load.items[0]).toMatchObject({ price: 100, quantity: 3, subtotal: 300, store: { name: 'Día' } });
    });
  });

  describe('comercio', () => {
    it('uno de Precios Claros se completa con la sucursal', () => {
      const load = resolveSharedCart(cartOf([{ ean: LECHE, quantity: 1, store: COTO }]), context({ branches: [branch] }));
      expect(load.items[0].store).toEqual({
        name: 'Coto — Caballito', sepaId: '12-1-45', chain: 'Coto', barrio: 'Caballito', address: 'Rivadavia 5000', lat: -34.6, lng: -58.4,
      });
    });

    it('si la sucursal no está, queda con nombre y sepaId', () => {
      expect(resolveSharedCart(cartOf([{ ean: LECHE, quantity: 1, store: COTO }]), context()).items[0].store).toEqual(COTO);
    });

    it('uno a mano queda como viajó', () => {
      const store = { name: 'Almacén', barrio: 'Once', address: 'Pueyrredón 1' };
      expect(resolveSharedCart(cartOf([{ ean: LECHE, quantity: 1, store }]), context()).items[0].store).toEqual(store);
    });

    it('sin comercio no lleva la clave', () => {
      expect(resolveSharedCart(cartOf([{ ean: LECHE, quantity: 1 }]), context()).items[0]).not.toHaveProperty('store');
    });
  });

  describe('precio', () => {
    const mio: Product = { id: 'mio', name: 'Mi leche', ean: LECHE };
    const references = new Map([[LECHE, 70.126]]);
    const priceOf = (kind: SharedCart['kind'], shared: Partial<SharedItem>, patch: Partial<SharedContext>) =>
      resolveSharedCart(
        { kind, ...(kind === 'purchase' && { date: '2026-11-12' }), items: [{ ean: LECHE, quantity: 1, ...shared }] }, context(patch),
      ).items[0].price;

    it('de un carrito: el del link, aunque haya uno propio', () => {
      expect(priceOf('cart', { price: 50 }, { products: [mio], prices: [price('mio', 60)], references })).toBe(50);
    });

    it('de un carrito sin precio: el último propio, si no la referencia, si no 0', () => {
      expect(priceOf('cart', {}, { products: [mio], prices: [price('mio', 60)], references })).toBe(60);
      expect(priceOf('cart', {}, { products: [mio], references })).toBe(70.13);
      expect(priceOf('cart', {}, {})).toBe(0);
    });

    it('de una compra: el último propio, si no la referencia, si no el del link, si no 0', () => {
      expect(priceOf('purchase', { price: 50 }, { products: [mio], prices: [price('mio', 60)], references })).toBe(60);
      expect(priceOf('purchase', { price: 50 }, { references })).toBe(70.13);
      expect(priceOf('purchase', { price: 50 }, {})).toBe(50);
      expect(priceOf('purchase', {}, {})).toBe(0);
    });
  });
});

describe('sharedItemName', () => {
  const sepaLeche: SepaProduct = { ean: LECHE, description: 'LECHE ENTERA', brand: null, size: null, sizeUnit: null, banderas: 5 };
  const own: Product[] = [{ id: 'mio', name: 'Mi leche', ean: LECHE }];
  const catalog = new Map([[LECHE, sepaLeche]]);

  it('el propio, el del catálogo, el del link y, sin nada, undefined', () => {
    const item: SharedItem = { ean: LECHE, name: 'Del link', quantity: 1 };
    expect(sharedItemName(item, own, catalog)).toBe('Mi leche');
    expect(sharedItemName(item, [], catalog)).toBe('Leche Entera');
    expect(sharedItemName(item, [], new Map())).toBe('Del link');
    expect(sharedItemName({ ean: LECHE, quantity: 1 }, [], new Map())).toBeUndefined();
  });
});

describe('localIsoDate', () => {
  it('es el día en hora local', () => {
    expect(localIsoDate(new Date(2026, 10, 2, 23, 59))).toBe('2026-11-02');
  });
});
