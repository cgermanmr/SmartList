import WhatsAppIcon from '@/components/WhatsAppIcon';
import { APP_URL, SHARE_TEXT, whatsappUrl } from '@/lib/share';

/**
 * Compartir la app por WhatsApp (spec 30): link con el mensaje escrito, sin JavaScript. Va en el header, fuera del
 * link a /. El logo va en blanco, porque el verde es "más barato".
 */
export default function WhatsAppButton() {
  return (
    <a
      href={whatsappUrl(SHARE_TEXT, APP_URL)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Compartir El Changuito por WhatsApp"
      className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
      <WhatsAppIcon className="size-6" />
    </a>
  );
}
