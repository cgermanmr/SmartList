import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import Logo from '@/components/Logo';

// Vista previa del link (spec 30). Se genera en el build; la fuente está en el repo para que no dependa de la red.
// Lo importante va en el cuadrado central de 630 px: WhatsApp a veces recorta la imagen a esa forma.

export const alt = 'El Changuito: compará precios cerca tuyo';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const rubikSemiBold = await readFile(join(process.cwd(), 'src/assets/Rubik-SemiBold.ttf'));

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          // primary-700 y accent-400: acá no llegan las variables de globals.css
          background: '#5b2a86',
          color: '#ffffff',
          fontFamily: 'Rubik',
        }}>
        <div style={{ display: 'flex', color: '#ffd23f' }}>
          <Logo size={270} />
        </div>
        <div style={{ display: 'flex', marginTop: 4, fontSize: 92, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          El Changuito
        </div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 40, lineHeight: 1.2, color: '#ede4f6' }}>
          Compará precios cerca tuyo
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Rubik', data: rubikSemiBold, style: 'normal', weight: 600 }] },
  );
}
