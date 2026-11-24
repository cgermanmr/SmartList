import { describe, expect, it } from 'vitest';
import { type AppEnv, buildManifest, envLabel, installName, pageTitle, resolveAppEnv } from './app-env';

describe('resolveAppEnv', () => {
  it.each<[{ VERCEL?: string; VERCEL_ENV?: string }, AppEnv]>([
    [{ VERCEL: '1', VERCEL_ENV: 'production' }, 'production'],
    [{ VERCEL: '1', VERCEL_ENV: 'preview' }, 'preview'],
    [{ VERCEL: '1', VERCEL_ENV: 'development' }, 'local'],
    [{}, 'local'],
    [{ VERCEL: '' }, 'local'],
    // Fuera de Vercel no importa VERCEL_ENV: nunca se ve como producción
    [{ VERCEL_ENV: 'production' }, 'local'],
    [{ VERCEL: '', VERCEL_ENV: 'preview' }, 'local'],
  ])('%o → %s', (env, expected) => {
    expect(resolveAppEnv(env)).toBe(expected);
  });

  it.each([{ VERCEL: '1' }, { VERCEL: '1', VERCEL_ENV: '' }, { VERCEL: '1', VERCEL_ENV: 'staging' }])(
    'en Vercel sin un entorno conocido lanza el error: %o',
    env => {
      expect(() => resolveAppEnv(env)).toThrow(
        'No se conoce el entorno de Vercel: revisar Automatically expose System Environment Variables',
      );
    },
  );
});

describe('envLabel', () => {
  it.each<[AppEnv, string | null]>([
    ['production', null],
    ['preview', 'DEV'],
    ['local', 'LOCAL'],
  ])('%s → %s', (env, expected) => {
    expect(envLabel(env)).toBe(expected);
  });
});

describe('installName', () => {
  it.each<[AppEnv, string]>([
    ['production', 'El Changuito'],
    ['preview', 'DEV Changuito'],
    ['local', 'LOCAL Changuito'],
  ])('%s → %s', (env, expected) => {
    expect(installName(env)).toBe(expected);
  });
});

describe('pageTitle', () => {
  it.each<[string, AppEnv, string]>([
    ['El Changuito', 'production', 'El Changuito'],
    ['El Changuito', 'preview', 'DEV · El Changuito'],
    ['El Changuito', 'local', 'LOCAL · El Changuito'],
    ['Privacidad — El Changuito', 'production', 'Privacidad — El Changuito'],
    ['Privacidad — El Changuito', 'preview', 'DEV · Privacidad — El Changuito'],
    // La plantilla de título de Next pasa como un texto más
    ['%s', 'preview', 'DEV · %s'],
    ['%s', 'production', '%s'],
  ])('%s en %s → %s', (title, env, expected) => {
    expect(pageTitle(title, env)).toBe(expected);
  });
});

describe('buildManifest', () => {
  // Copia del public/manifest.json anterior a la spec 32: las apps ya instaladas no cambian
  const BEFORE = `{
  "name": "El Changuito",
  "short_name": "El Changuito",
  "description": "PWA para comparar precios y gestionar compras",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#faf8fc",
  "theme_color": "#5b2a86",
  "lang": "es",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    },
    {
      "src": "/icon-maskable.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "maskable"
    }
  ]
}`;

  it('en producción es idéntico al de antes, también en el orden', () => {
    expect(JSON.stringify(buildManifest('production'), null, 2)).toBe(BEFORE);
  });

  it.each<[AppEnv, string, string, string]>([
    ['preview', 'DEV Changuito', '/icon-dev.svg', '/icon-dev-maskable.svg'],
    ['local', 'LOCAL Changuito', '/icon-local.svg', '/icon-local-maskable.svg'],
  ])('en %s solo cambian el nombre y los íconos', (env, name, any, maskable) => {
    const before = JSON.parse(BEFORE);
    before.name = name;
    before.short_name = name;
    before.icons[0].src = any;
    before.icons[1].src = maskable;
    expect(buildManifest(env)).toEqual(before);
  });
});
