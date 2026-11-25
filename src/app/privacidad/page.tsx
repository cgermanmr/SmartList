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
          Tus precios son privados: no se comparten con otras personas, salvo con tu grupo si te unís a uno.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Grupos</h2>
        <p>
          Si creás un grupo o te unís a uno, los demás integrantes ven tus precios de productos con código de barras de
          los últimos 60 días: el monto, la fecha y el comercio con su dirección y su ubicación. También ven el nombre
          que elegiste para el grupo. Nunca ven tu mail ni tus otros datos (productos sin código, carrito, compras,
          fotos).
        </p>
        <p>
          Los precios no se copian: se consultan en el momento a tu cuenta. Dejás de compartirlos al apagar{' '}
          <strong>Compartir mis precios</strong>, al salir del grupo o al borrar la cuenta, y desde ahí el grupo ya no
          los ve (como mucho 5 minutos después, en un teléfono que ya los tenía en pantalla). Quien administra el grupo
          también puede sacarte.
        </p>
        <p>
          Podés decir si un precio de otro integrante <strong>Está bien</strong> o <strong>No coincide</strong>. Tu
          voto, con el nombre que elegiste para el grupo y el monto que pongas en <strong>¿Cuánto viste?</strong>, lo
          ven quien cargó el precio y el resto del grupo. Tus votos y los votos sobre tus precios se borran al salir del
          grupo (o si te sacan) y al borrar la cuenta.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Fotos de tus productos</h2>
        <p>
          Las fotos que agregás a tus productos se achican y se guardan en este teléfono. Antes de guardarlas se les
          sacan los datos que trae el archivo: la ubicación donde se sacó, la fecha y el modelo de la cámara.
        </p>
        <p>
          Con cuenta, se guarda también una copia en un almacenamiento privado de Supabase, para verlas en tus otros
          teléfonos. Solo las ves vos: no se comparten con otras personas. Quitar una foto la borra; borrar la cuenta
          borra todas.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Tu ubicación</h2>
        <p>
          La ubicación que usás para ver comercios cercanos no se guarda en tu cuenta ni sale del teléfono, salvo en dos
          casos. Uno es el mapa con la ruta a un comercio: para marcarla, tu ubicación se envía a OpenStreetMap, y el
          mapa lo avisa. El otro es la dirección de un comercio nuevo, que se explica acá abajo.
        </p>
        <p>
          Al cargar un precio, &ldquo;Usar mi ubicación&rdquo; busca los comercios que tenés cerca sin cambiar la ubicación
          de comercios cercanos. Si elegís &ldquo;Otro comercio acá&rdquo;, el precio guarda las coordenadas de ese comercio
          (redondeadas, a unos 10 metros) para mostrar su distancia y su mapa, y con cuenta se sincronizan junto con el
          precio. Son las del comercio, no un registro de por dónde andás.
        </p>
        <p>
          Al agregar un comercio, mientras escribís la dirección el texto se envía a Georef (datos.gob.ar, del Estado
          argentino) para sugerirte direcciones. Tu ubicación no se envía: para mostrarte primero las cercanas, van los
          códigos de los 15 partidos o comunas más próximos, que dan una idea gruesa de la zona.
        </p>
        <p>
          El punto del comercio se envía a OpenStreetMap para buscar su dirección solo si tocás{' '}
          <strong>Completar la dirección</strong> o si movés el mapa y tocás <strong>Usar este punto</strong>. Si ese
          punto es tu ubicación, es tu ubicación lo que se envía. La app lo avisa en los dos lugares. El mapa también
          pide a OpenStreetMap las imágenes de la zona que se ve.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Compartir por WhatsApp</h2>
        <p>
          Al compartir un carrito o una compra por WhatsApp, el mensaje lleva los productos, las cantidades, los precios
          y los comercios (nombre, barrio y dirección; nunca tu ubicación). Los datos van dentro del link y no los
          guardamos: los ve quien recibe el mensaje y cualquiera a quien se lo reenvíe.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Cómo borrar tus datos</h2>
        <p>
          Eliminar un producto borra sus precios y su foto, también en tus otros dispositivos si tenés cuenta.
        </p>
        <p>
          En <Link href="/cuenta" className="font-semibold text-primary-700 underline underline-offset-2">Cuenta</Link>,
          {' '}<strong>Borrar mi cuenta</strong> elimina tu cuenta y todos tus datos guardados, fotos incluidas, en todos
          tus dispositivos, y te saca de tu grupo. No se puede deshacer. Cerrar sesión borra los datos y las fotos de este teléfono; siguen en
          tu cuenta.
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
