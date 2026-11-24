import WhatsAppIcon from '@/components/WhatsAppIcon';
import { CartItem, Purchase } from '@/lib/models';
import { ReferenceSummary } from '@/lib/sepa';
import { whatsappUrl } from '@/lib/share';
import { localIsoDate, MAX_SHARED_ITEMS, SharedCart, sharedCartUrl, sharedFromItems, shareMessage } from '@/lib/shared-cart';
import { useStore } from '@/lib/store';

interface Props {
  items: CartItem[];
  /** Referencias que la pantalla ya pidió: un producto con referencia está en el catálogo y viaja sin el nombre */
  references: Map<string, ReferenceSummary>;
  /** Fecha de la compra (spec 31): sin ella, es un carrito */
  purchaseDate?: Purchase['date'];
  /** Con etiqueta, botón de solo ícono */
  iconLabel?: string;
  className?: string;
}

/**
 * Compartir por WhatsApp un carrito, un comercio del carrito o una compra (spec 31): un link con el mensaje escrito,
 * sin estados de carga. Con más de 100 productos, en su lugar explica el tope.
 */
export default function ShareCartLink({ items, references, purchaseDate, iconLabel, className = '' }: Props) {
  const products = useStore(s => s.products);

  if (items.length > MAX_SHARED_ITEMS) {
    return <p className="basis-full text-sm text-gray-600">Se pueden compartir hasta {MAX_SHARED_ITEMS} productos</p>;
  }

  const shared = sharedFromItems(items, products, ean => references.has(ean));
  const cart: SharedCart = purchaseDate === undefined
    ? { kind: 'cart', items: shared }
    : { kind: 'purchase', date: localIsoDate(new Date(purchaseDate)), items: shared };
  const href = whatsappUrl(shareMessage(cart, items.map(item => item.productName)), sharedCartUrl(cart));

  if (iconLabel) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={iconLabel}
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-primary-700 hover:bg-primary-100 active:bg-primary-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${className}`}>
        <WhatsAppIcon className="size-5" />
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn-secondary inline-flex items-center justify-center gap-2 ${className}`}>
      <WhatsAppIcon className="size-5 shrink-0" />
      Compartir por WhatsApp
    </a>
  );
}
