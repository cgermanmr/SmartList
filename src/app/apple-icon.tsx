import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import Logo from '@/components/Logo';
import { APP_ENV, envLabel } from '@/lib/app-env';

// Ícono de inicio del iPhone, que no usa los SVG (spec 32). Se genera en el build, cuadrado y opaco: las esquinas las
// redondea el sistema. Es el mismo dibujo de public/icon*.svg, con las medidas de 192 px llevadas a 180.

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// primary-700 y accent-400: acá no llegan las variables de globals.css
const PRIMARY = '#5b2a86';
const ACCENT = '#ffd23f';

const rubikSemiBold = await readFile(join(process.cwd(), 'src/assets/Rubik-SemiBold.ttf'));

export default function AppleIcon() {
  const label = envLabel(APP_ENV);
  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          background: label ? ACCENT : PRIMARY,
          color: label ? PRIMARY : ACCENT,
          fontFamily: 'Rubik',
        }}>
        {label ? (
          <>
            <div style={{ position: 'absolute', left: 36, top: 7, display: 'flex' }}>
              <Logo size={112} />
            </div>
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                width: '100%',
                height: 51,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: PRIMARY,
                color: ACCENT,
                fontSize: 40,
                lineHeight: 1,
                letterSpacing: '0.05em',
              }}>
              {label}
            </div>
          </>
        ) : (
          <div style={{ position: 'absolute', left: 31, top: 34, display: 'flex' }}>
            <Logo size={118} />
          </div>
        )}
      </div>
    ),
    { ...size, fonts: [{ name: 'Rubik', data: rubikSemiBold, style: 'normal', weight: 600 }] },
  );
}
