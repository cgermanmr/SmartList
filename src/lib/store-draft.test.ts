import { describe, expect, it } from 'vitest';
import { AddressSuggestion } from './address';
import {
  addressSearch, applyReverse, chooseSuggestion, draftOrigin, draftStore, emptyDraft, mapCenter, markPoint, removePoint,
  typeAddress, typeBarrio, typedNumber,
} from './store-draft';

const GPS = { lat: -34.6365, lng: -58.4009 };
const MARKED = { lat: -34.6, lng: -58.4 };

const CASEROS_2500: AddressSuggestion = {
  street: 'Av. Caseros', number: '2500', place: 'Comuna 4, CABA', locality: 'CABA',
  point: { lat: -34.63567, lng: -58.39743 }, distanceKm: 0.3,
};
const CASEROS: AddressSuggestion = {
  street: 'Av. Caseros', place: 'CABA', locality: 'CABA', point: { lat: -34.63635, lng: -58.4013 }, distanceKm: 0.04,
};

// ── Elegir una sugerencia ────────────────────────────────────

describe('chooseSuggestion', () => {
  it('con altura completa la dirección y el punto, aunque hubiera uno del GPS o marcado', () => {
    for (const draft of [emptyDraft(), emptyDraft(GPS), markPoint(emptyDraft(), MARKED)]) {
      const chosen = chooseSuggestion(draft, CASEROS_2500);
      expect(chosen.address).toBe('Av. Caseros 2500');
      expect(chosen.point).toEqual({ ...CASEROS_2500.point, source: 'suggestion' });
      expect(chosen.street).toBeNull();
    }
  });

  it('sin altura completa la calle con un espacio al final y no cambia el punto', () => {
    const chosen = chooseSuggestion(markPoint(emptyDraft(), MARKED), CASEROS);
    expect(chosen.address).toBe('Av. Caseros ');
    expect(chosen.street).toEqual(CASEROS);
    expect(chosen.point).toEqual({ ...MARKED, source: 'marked' });
    expect(chooseSuggestion(emptyDraft(), CASEROS).point).toBeNull();
  });

  it('una calle por altura inexistente queda con el número escrito, sin punto nuevo', () => {
    const typed = typeAddress(emptyDraft(), 'caseros 99999');
    const chosen = chooseSuggestion(typed, CASEROS, '99999');
    expect(chosen.address).toBe('Av. Caseros 99999');
    expect(chosen.point).toBeNull();
    expect(chosen.street).toEqual(CASEROS);
  });

  it('una sugerencia con altura y sin ubicación no deja el punto de la anterior', () => {
    const first = chooseSuggestion(emptyDraft(GPS), CASEROS_2500);
    expect(chooseSuggestion(first, { ...CASEROS_2500, point: null }).point).toEqual({ ...GPS, source: 'gps' });
  });

  it('vacía un barrio completado por la app y respeta uno escrito a mano', () => {
    const auto = applyReverse(emptyDraft(GPS), { address: 'Mitre 1', barrio: 'Olivos' });
    expect(chooseSuggestion(auto, CASEROS_2500).barrio).toBe('');
    expect(chooseSuggestion(typeBarrio(auto, 'Florida'), CASEROS_2500).barrio).toBe('Florida');
  });
});

// ── Escribir en Dirección ────────────────────────────────────

describe('typeAddress', () => {
  it('descarta el punto de la sugerencia', () => {
    expect(typeAddress(chooseSuggestion(emptyDraft(), CASEROS_2500), 'Av. Caseros 250').point).toBeNull();
  });

  it('en "Otro comercio acá" vuelve el punto del GPS', () => {
    const typed = typeAddress(chooseSuggestion(emptyDraft(GPS), CASEROS_2500), 'x');
    expect(typed.point).toEqual({ ...GPS, source: 'gps' });
  });

  it('el punto del GPS no vuelve si se había quitado', () => {
    const typed = typeAddress(chooseSuggestion(removePoint(emptyDraft(GPS)), CASEROS_2500), 'x');
    expect(typed.point).toBeNull();
  });

  it('no descarta un punto marcado ni el del GPS', () => {
    expect(typeAddress(markPoint(emptyDraft(), MARKED), 'x').point?.source).toBe('marked');
    expect(typeAddress(emptyDraft(GPS), 'x').point?.source).toBe('gps');
  });

  it('cambiar el nombre de la calle saca la calle elegida; agregar la altura, no', () => {
    const chosen = chooseSuggestion(emptyDraft(), CASEROS);
    expect(typeAddress(chosen, 'Av. Caseros 2500').street).toEqual(CASEROS);
    expect(typeAddress(chosen, 'Av. Caser').street).toBeNull();
  });
});

// ── Punto ────────────────────────────────────────────────────

describe('markPoint y removePoint', () => {
  it('marcan y quitan el punto sin tocar los campos', () => {
    const draft = typeAddress(emptyDraft(GPS), 'Mitre 10');
    expect(markPoint(draft, MARKED)).toMatchObject({ address: 'Mitre 10', point: { ...MARKED, source: 'marked' } });
    expect(removePoint(draft)).toMatchObject({ address: 'Mitre 10', point: null });
  });
});

describe('applyReverse', () => {
  it('reemplaza la dirección, completa el barrio vacío y no toca el punto', () => {
    const draft = applyReverse(typeAddress(emptyDraft(GPS), 'otra'), { address: 'Avenida Caseros 2726', barrio: 'Parque Patricios' });
    expect(draft).toMatchObject({ address: 'Avenida Caseros 2726', barrio: 'Parque Patricios', point: { source: 'gps' } });
  });

  it('reemplaza un barrio que había completado la app, también con ninguno', () => {
    const first = applyReverse(emptyDraft(GPS), { address: 'A 1', barrio: 'Uno' });
    expect(applyReverse(first, { address: 'B 2', barrio: 'Dos' }).barrio).toBe('Dos');
    expect(applyReverse(first, { address: 'B 2' }).barrio).toBe('');
  });

  it('no toca un barrio escrito a mano; vacío cuenta como sin escribir', () => {
    expect(applyReverse(typeBarrio(emptyDraft(GPS), 'Boedo'), { address: 'A 1', barrio: 'X' }).barrio).toBe('Boedo');
    expect(applyReverse(typeBarrio(emptyDraft(GPS), '  '), { address: 'A 1', barrio: 'X' }).barrio).toBe('X');
  });

  it('saca la calle elegida', () => {
    expect(applyReverse(chooseSuggestion(emptyDraft(), CASEROS), { address: 'A 1' }).street).toBeNull();
  });
});

// ── Referencia, centro del mapa y búsqueda ───────────────────

describe('draftOrigin', () => {
  const location = { lat: -34, lng: -58, source: 'localidad' as const, label: 'Olivos' };

  it('el punto del GPS o marcado primero; si no, la ubicación de la app', () => {
    expect(draftOrigin(emptyDraft(GPS), location)).toEqual({ point: GPS, approx: false });
    expect(draftOrigin(markPoint(emptyDraft(), MARKED), null)).toEqual({ point: MARKED, approx: false });
    expect(draftOrigin(emptyDraft(), location)).toEqual({ point: { lat: -34, lng: -58 }, approx: true });
    expect(draftOrigin(emptyDraft(), { ...location, source: 'gps' })).toMatchObject({ approx: false });
    expect(draftOrigin(emptyDraft(), null)).toEqual({ point: null, approx: false });
  });

  it('el punto de una sugerencia no es referencia', () => {
    expect(draftOrigin(chooseSuggestion(emptyDraft(), CASEROS_2500), null).point).toBeNull();
  });
});

describe('mapCenter', () => {
  const location = { lat: -34, lng: -58, source: 'gps' as const, label: 'Mi ubicación' };

  it('el punto, la calle elegida, la ubicación de la app o todo el país', () => {
    expect(mapCenter(chooseSuggestion(emptyDraft(GPS), CASEROS), location)).toMatchObject({ lat: GPS.lat, zoom: 17 });
    expect(mapCenter(chooseSuggestion(emptyDraft(), CASEROS), location)).toEqual({ ...CASEROS.point, zoom: 17 });
    expect(mapCenter(emptyDraft(), location)).toEqual({ lat: -34, lng: -58, zoom: 15 });
    expect(mapCenter(emptyDraft(), null).zoom).toBeLessThan(6);
  });
});

describe('addressSearch', () => {
  it('con 3 caracteres o más, lo escrito', () => {
    expect(addressSearch(typeAddress(emptyDraft(), ' ca'))).toBeNull();
    expect(addressSearch(typeAddress(emptyDraft(), 'cas '))).toEqual({ query: 'cas' });
  });

  it('con una calle elegida, solo al escribir la altura y acotada a ella', () => {
    const chosen = chooseSuggestion(emptyDraft(), CASEROS);
    expect(addressSearch(chosen)).toBeNull();
    expect(addressSearch(typeAddress(chosen, 'Av. Caseros 2500'))).toEqual({ query: 'Av. Caseros 2500', street: CASEROS });
    expect(addressSearch(typeAddress(chosen, 'Av. Case'))).toEqual({ query: 'Av. Case' });
  });

  it('la dirección que completó la app no se busca', () => {
    expect(addressSearch(chooseSuggestion(emptyDraft(), CASEROS_2500))).toBeNull();
    expect(addressSearch(chooseSuggestion(typeAddress(emptyDraft(), 'caseros 99999'), CASEROS, '99999'))).toBeNull();
    expect(addressSearch(applyReverse(emptyDraft(GPS), { address: 'Mitre 10' }))).toBeNull();
  });
});

describe('typedNumber', () => {
  it('la altura escrita, con una calle elegida o sin ella', () => {
    expect(typedNumber(typeAddress(emptyDraft(), 'caseros 99999'))).toBe('99999');
    expect(typedNumber(typeAddress(emptyDraft(), 'caseros'))).toBeUndefined();
    const numbered = { ...CASEROS, street: 'Calle 7' };
    expect(typedNumber(typeAddress(chooseSuggestion(emptyDraft(), numbered), 'Calle 7 99999'))).toBe('99999');
    expect(typedNumber(chooseSuggestion(emptyDraft(), numbered))).toBeUndefined();
  });
});

describe('cambiar el punto', () => {
  it('no vuelve a buscar lo que ya se había escrito', () => {
    const typed = typeAddress(emptyDraft(GPS), 'Mitre');
    expect(addressSearch(markPoint(typed, MARKED))).toBeNull();
    expect(addressSearch(removePoint(typed))).toBeNull();
  });
});

describe('draftStore', () => {
  it('el comercio sin espacios de más y con el punto redondeado a 4 decimales', () => {
    const draft = { ...chooseSuggestion(emptyDraft(), CASEROS_2500), name: ' Super  Luna ' };
    expect(draftStore(draft)).toEqual({ name: 'Super Luna', address: 'Av. Caseros 2500', lat: -34.6357, lng: -58.3974 });
  });

  it('sin número queda la calle, y sin punto no lleva coordenadas', () => {
    const draft = { ...chooseSuggestion(emptyDraft(), CASEROS), name: 'Luna' };
    expect(draftStore(draft)).toEqual({ name: 'Luna', address: 'Av. Caseros' });
  });
});
