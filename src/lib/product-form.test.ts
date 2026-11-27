import { describe, expect, it } from 'vitest';
import { Product } from './models';
import {
  CATEGORIES, categorySuggestions, checkEan, EMPTY_PRODUCT_FORM, formFromSepa, inferOrigin, isFromSepa, productFromForm,
  productFromSepa, sepaLinkChanges, withOrigins,
} from './product-form';
import { SepaProduct } from './sepa';

const sepaProduct: SepaProduct = {
  ean: '7793704000911', description: 'YERBA MATE PLAYADITO', brand: 'PLAYADITO', size: 500, sizeUnit: 'g', banderas: 16,
};

const products: Product[] = [
  { id: '1', name: 'Yerba', category: 'Almacen', ean: '7793704000911' },
  { id: '2', name: 'Arroz', category: 'Almacen' },
];

describe('checkEan', () => {
  it('vacío es válido: el código es opcional', () => {
    expect(checkEan('', products)).toEqual({ status: 'empty' });
    expect(checkEan('   ', products)).toEqual({ status: 'empty' });
  });

  it('devuelve el código normalizado a GTIN-13', () => {
    expect(checkEan('7791234567898', products)).toEqual({ status: 'ok', ean: '7791234567898' });
    expect(checkEan(' 7791234567898 ', products)).toEqual({ status: 'ok', ean: '7791234567898' });
    expect(checkEan('96385074', products)).toEqual({ status: 'ok', ean: '0000096385074' });
  });

  it('rechaza un dígito verificador incorrecto o un texto que no es código', () => {
    expect(checkEan('7793704000912', products)).toEqual({ status: 'invalid' });
    expect(checkEan('yerba', products)).toEqual({ status: 'invalid' });
  });

  it('rechaza un GTIN-14 de otro nivel de empaque, que no se puede pasar a GTIN-13', () => {
    expect(checkEan('17791234567895', products)).toEqual({ status: 'invalid' });
  });

  it('detecta un código que ya tiene otro producto propio', () => {
    expect(checkEan('7793704000911', products)).toEqual({ status: 'duplicate', product: products[0] });
  });

  it('detecta el duplicado aunque el código venga escrito en otro formato', () => {
    const own = [{ id: '3', name: 'Galletitas', category: 'Almacen', ean: '0000096385074' }];
    expect(checkEan('96385074', own)).toEqual({ status: 'duplicate', product: own[0] });
  });

  it('puede excluir al producto que se está vinculando', () => {
    expect(checkEan('7793704000911', products, '1')).toEqual({ status: 'ok', ean: '7793704000911' });
  });
});

describe('formFromSepa', () => {
  it('completa nombre, marca, presentación y EAN, y conserva la categoría escrita', () => {
    expect(formFromSepa(sepaProduct, 'Almacen')).toEqual({
      name: 'Yerba Mate', category: 'Almacen', ean: '7793704000911', brand: 'PLAYADITO', size: '500', sizeUnit: 'g',
    });
  });

  it('sin marca ni presentación deja esos campos vacíos', () => {
    const form = formFromSepa({ ...sepaProduct, brand: null, size: null, sizeUnit: null }, '');
    expect(form.brand).toBe('');
    expect(form.size).toBe('');
    expect(form.sizeUnit).toBe(EMPTY_PRODUCT_FORM.sizeUnit);
  });
});

describe('productFromForm', () => {
  const form = {
    ...EMPTY_PRODUCT_FORM, name: ' Yerba Mate ', category: ' Almacen ', brand: ' PLAYADITO ', size: '500', sizeUnit: 'g' as const,
  };

  it('arma el producto con los datos limpios y el EAN ya validado', () => {
    expect(productFromForm(form, 'p1', '7793704000911')).toEqual({
      id: 'p1', name: 'Yerba Mate', category: 'Almacen', ean: '7793704000911', brand: 'PLAYADITO', size: 500, sizeUnit: 'g',
      origin: 'manual',
    });
  });

  it('sin datos opcionales no agrega claves al JSON guardado', () => {
    const product = productFromForm({ ...EMPTY_PRODUCT_FORM, name: 'Pan', category: 'Almacen' }, 'p2');
    expect(JSON.parse(JSON.stringify(product))).toEqual({ id: 'p2', name: 'Pan', category: 'Almacen', origin: 'manual' });
  });

  it('sin categoría no la guarda, ni como texto vacío', () => {
    for (const category of ['', '   ']) {
      const product = productFromForm({ ...EMPTY_PRODUCT_FORM, name: 'Pan', category }, 'p5');
      expect(product.category).toBeUndefined();
      expect(JSON.parse(JSON.stringify(product))).toEqual({ id: 'p5', name: 'Pan', origin: 'manual' });
    }
  });

  it('la presentación va completa o no va: sin número válido no guarda la unidad', () => {
    for (const size of ['', '0', '-5']) {
      const product = productFromForm({ ...form, size }, 'p3');
      expect(product.size).toBeUndefined();
      expect(product.sizeUnit).toBeUndefined();
    }
  });

  it('acepta una presentación con decimales', () => {
    expect(productFromForm({ ...form, size: '1.5', sizeUnit: 'l' }, 'p4')).toMatchObject({ size: 1.5, sizeUnit: 'l' });
  });

  it('guarda el origen que le pasan (completado desde el catálogo con el mismo EAN)', () => {
    expect(productFromForm(form, 'p6', '7793704000911', 'sepa').origin).toBe('sepa');
  });
});

describe('sepaLinkChanges', () => {
  const unlinked: Product = { id: '5', name: 'Yerba de la abuela', category: 'Almacen' };
  const linked: Product = { ...unlinked, ean: '7791234567898', brand: 'OTRA', size: 1, sizeUnit: 'kg' };

  it('vincular un producto sin EAN asigna el código y completa marca y presentación vacías', () => {
    expect(sepaLinkChanges(unlinked, sepaProduct)).toEqual({
      ean: '7793704000911', brand: 'PLAYADITO', size: 500, sizeUnit: 'g',
    });
  });

  it('vincular conserva la marca y la presentación que escribió el usuario', () => {
    const own = { ...unlinked, brand: 'Playadito', size: 0.5, sizeUnit: 'kg' as const };
    expect(sepaLinkChanges(own, sepaProduct)).toEqual({ ean: '7793704000911' });
  });

  it('cambiar el vínculo reemplaza la marca y la presentación por las del catálogo', () => {
    expect(sepaLinkChanges(linked, sepaProduct)).toEqual({
      ean: '7793704000911', brand: 'PLAYADITO', size: 500, sizeUnit: 'g',
    });
  });

  it('cambiar el vínculo no toca lo que el catálogo trae vacío', () => {
    const bare = { ...sepaProduct, brand: null, size: null, sizeUnit: null };
    expect(sepaLinkChanges(linked, bare)).toEqual({ ean: '7793704000911' });
  });

  it('nunca cambia el nombre ni la categoría', () => {
    for (const product of [unlinked, linked]) {
      const changed = { ...product, ...sepaLinkChanges(product, sepaProduct) };
      expect(changed.name).toBe(product.name);
      expect(changed.category).toBe(product.category);
    }
  });
});

describe('productFromSepa', () => {
  it('crea el producto vinculado con nombre sugerido, marca, presentación y EAN, sin categoría', () => {
    const product = productFromSepa(sepaProduct, 'p1');
    expect(product).toEqual({
      id: 'p1', name: 'Yerba Mate', ean: '7793704000911', brand: 'PLAYADITO', size: 500, sizeUnit: 'g', origin: 'sepa',
    });
    expect(product).not.toHaveProperty('category');
  });

  it('sin marca ni presentación no agrega esas claves al JSON guardado', () => {
    const product = productFromSepa({ ...sepaProduct, brand: null, size: null, sizeUnit: null }, 'p2');
    expect(JSON.parse(JSON.stringify(product))).toEqual({ id: 'p2', name: 'Yerba Mate Playadito', ean: '7793704000911', origin: 'sepa' });
  });

  it('la presentación va completa o no va', () => {
    expect(productFromSepa({ ...sepaProduct, sizeUnit: null }, 'p3').size).toBeUndefined();
    expect(productFromSepa({ ...sepaProduct, size: 0 }, 'p4').sizeUnit).toBeUndefined();
  });
});

describe('origen del producto (spec 36)', () => {
  it('inferOrigin: con código y sin categoría es del catálogo; si no, cargado a mano', () => {
    expect(inferOrigin({ id: '1', name: 'Yerba', ean: '7793704000911' })).toBe('sepa');
    expect(inferOrigin({ id: '2', name: 'Yerba', ean: '7793704000911', category: 'Almacen' })).toBe('manual');
    expect(inferOrigin({ id: '3', name: 'Pan', category: 'Almacen' })).toBe('manual');
    expect(inferOrigin({ id: '4', name: 'Pan' })).toBe('manual');
  });

  it('withOrigins escribe el origen solo de los que no lo tienen', () => {
    const own: Product = { id: '1', name: 'Yerba', ean: '7793704000911', origin: 'manual' };
    const old: Product = { id: '2', name: 'Café', ean: '7790000000001' };
    const result = withOrigins([own, old]);
    expect(result[0]).toBe(own);
    expect(result[1]).toEqual({ ...old, origin: 'sepa' });
  });

  it('withOrigins devuelve el mismo array si no cambió ninguno', () => {
    const products: Product[] = [{ id: '1', name: 'Pan', origin: 'manual' }, { id: '2', name: 'Café', origin: 'sepa' }];
    expect(withOrigins(products)).toBe(products);
    const empty: Product[] = [];
    expect(withOrigins(empty)).toBe(empty);
  });

  it('isFromSepa: solo con origen sepa; sin origen cuenta como cargado a mano', () => {
    expect(isFromSepa({ id: '1', name: 'Yerba', ean: '7793704000911', origin: 'sepa' })).toBe(true);
    expect(isFromSepa({ id: '2', name: 'Yerba', ean: '7793704000911', origin: 'manual' })).toBe(false);
    expect(isFromSepa({ id: '3', name: 'Yerba', ean: '7793704000911' })).toBe(false);
  });
});

describe('categorySuggestions', () => {
  const withCategory = (id: string, category?: string): Product => ({ id, name: `Producto ${id}`, category });

  it('sin productos propios, las fijas en orden alfabético', () => {
    expect(categorySuggestions([]))
      .toEqual(['Aceites', 'Almacen', 'Bebidas', 'Frutas', 'Lacteos', 'Limpieza', 'Proteina', 'Verduras']);
    expect(CATEGORIES).toHaveLength(8);
  });

  it('suma las propias en su lugar del orden alfabético', () => {
    expect(categorySuggestions([withCategory('1', 'Mascotas'), withCategory('2', 'Ñoquis')]))
      .toEqual(['Aceites', 'Almacen', 'Bebidas', 'Frutas', 'Lacteos', 'Limpieza', 'Mascotas', 'Ñoquis', 'Proteina', 'Verduras']);
  });

  it('no repite por mayúsculas ni acentos: queda la escritura propia', () => {
    const result = categorySuggestions([withCategory('1', 'lácteos'), withCategory('2', 'ALMACÉN')]);
    expect(result).toEqual(['Aceites', 'ALMACÉN', 'Bebidas', 'Frutas', 'lácteos', 'Limpieza', 'Proteina', 'Verduras']);
  });

  it('una categoría de varios productos aparece una vez', () => {
    const result = categorySuggestions([withCategory('1', 'Mascotas'), withCategory('2', ' mascotas '), withCategory('3', 'Mascotas')]);
    expect(result.filter(c => c.toLowerCase().trim() === 'mascotas')).toEqual(['Mascotas']);
  });

  it('ignora los productos sin categoría o con una en blanco', () => {
    expect(categorySuggestions([withCategory('1'), withCategory('2', '  ')])).toEqual(categorySuggestions([]));
  });
});
