import type { Metadata } from 'next';
import Link from 'next/link';
import { PRIVACY_CONTACT } from '@/lib/privacy';

export const metadata: Metadata = { title: 'Privacidad — El Changuito' };

/** Qué guarda la app, dónde y cómo borrarlo (spec 21). Lo pide la pantalla de consentimiento de Google */
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 pb-8 leading-relaxed">
      <h1 className="text-2xl font-bold">Privacidad</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sin cuenta</h2>
        <p>
          Todo lo que cargás (productos, precios, carrito, compras y la calculadora) queda solo en este teléfono, en el
          almacenamiento del navegador. Nadie más lo ve y se borra si borrás los datos del navegador.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Con cuenta</h2>
        <p>
          Si entrás con Google o con tu mail, guardamos tu nombre y tu mail para identificarte, y una copia de tus
          productos, precios, carrito, compras y calculadora, para que los tengas en cualquier teléfono. Se guardan en
          Supabase (servidores en la nube) y solo tu cuenta puede leerlos.
        </p>
        <p>
          Tus precios son privados: no se comparten con otras personas.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Tu ubicación</h2>
        <p>
          La ubicación que usás para ver comercios cercanos no se guarda en tu cuenta ni sale del teléfono. La única
          excepción es el mapa con la ruta a un comercio: para marcarla, tu ubicación se envía a OpenStreetMap, y el
          mapa lo avisa.
        </p>
        <p>
          Al cargar un precio, &ldquo;Usar mi ubicación&rdquo; busca los comercios que tenés cerca sin cambiar la ubicación
          de comercios cercanos. Si elegís &ldquo;Otro comercio acá&rdquo;, el precio guarda las coordenadas de ese comercio
          (redondeadas, a unos 10 metros) para mostrar su distancia y su mapa, y con cuenta se sincronizan junto con el
          precio. Son las del comercio, no un registro de por dónde andás.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Cómo borrar tus datos</h2>
        <p>
          En <Link href="/cuenta" className="font-semibold text-primary-700 underline underline-offset-2">Cuenta</Link>,
          {' '}<strong>Borrar mi cuenta</strong> elimina tu cuenta y todos tus datos guardados, en todos tus dispositivos.
          No se puede deshacer. Cerrar sesión borra los datos de este teléfono; siguen en tu cuenta.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contacto</h2>
        {PRIVACY_CONTACT ? (
          <p>
            Responsable: {PRIVACY_CONTACT.name}. Para consultas o para pedir el borrado de tus datos:{' '}
            <a href={`mailto:${PRIVACY_CONTACT.email}`} className="font-semibold text-primary-700 underline underline-offset-2">
              {PRIVACY_CONTACT.email}
            </a>.
          </p>
        ) : (
          <p className="text-gray-600">Contacto: a completar.</p>
        )}
      </section>
    </article>
  );
}
