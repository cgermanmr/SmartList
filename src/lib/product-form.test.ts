import { describe, expect, it } from 'vitest';
import { Product } from './models';
import {
  checkEan, EMPTY_PRODUCT_FORM, formFromSepa, productFromForm, productFromSepa, sepaLinkChanges,
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
    });
  });

  it('sin datos opcionales no agrega claves al JSON guardado', () => {
    const product = productFromForm({ ...EMPTY_PRODUCT_FORM, name: 'Pan', category: 'Almacen' }, 'p2');
    expect(JSON.parse(JSON.stringify(product))).toEqual({ id: 'p2', name: 'Pan', category: 'Almacen' });
  });

  it('sin categoría no la guarda, ni como texto vacío', () => {
    for (const category of ['', '   ']) {
      const product = productFromForm({ ...EMPTY_PRODUCT_FORM, name: 'Pan', category }, 'p5');
      expect(product.category).toBeUndefined();
      expect(JSON.parse(JSON.stringify(product))).toEqual({ id: 'p5', name: 'Pan' });
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
      id: 'p1', name: 'Yerba Mate', ean: '7793704000911', brand: 'PLAYADITO', size: 500, sizeUnit: 'g',
    });
    expect(product).not.toHaveProperty('category');
  });

  it('sin marca ni presentación no agrega esas claves al JSON guardado', () => {
    const product = productFromSepa({ ...sepaProduct, brand: null, size: null, sizeUnit: null }, 'p2');
    expect(JSON.parse(JSON.stringify(product))).toEqual({ id: 'p2', name: 'Yerba Mate Playadito', ean: '7793704000911' });
  });

  it('la presentación va completa o no va', () => {
    expect(productFromSepa({ ...sepaProduct, sizeUnit: null }, 'p3').size).toBeUndefined();
    expect(productFromSepa({ ...sepaProduct, size: 0 }, 'p4').sizeUnit).toBeUndefined();
  });
});
