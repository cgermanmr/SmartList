import { RefObject, useEffect, useRef, useState } from 'react';

export type LeafletModule = typeof import('leaflet');
export type LeafletMap = import('leaflet').Map;

/** Opciones de L.map de cada mapa: constantes de módulo (se leen solo al crearlo) */
type MapOptions = import('leaflet').MapOptions;

/**
 * Crea un mapa de OpenStreetMap en el contenedor y lo destruye al desmontarse. Leaflet usa `window` y no entra en el
 * JS inicial: se carga recién acá, la primera vez que se abre un mapa. `failed`: sin conexión o si no carga Leaflet
 */
export function useLeafletMap(options?: MapOptions): {
  containerRef: RefObject<HTMLDivElement | null>;
  leaflet: { L: LeafletModule; map: LeafletMap } | null;
  failed: boolean;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leaflet, setLeaflet] = useState<{ L: LeafletModule; map: LeafletMap } | null>(null);
  const [failed, setFailed] = useState(() => !navigator.onLine);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    let observer: ResizeObserver | null = null;

    Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(
      ([L]) => {
        if (cancelled) return;
        map = L.map(container, { zoomControl: false, ...options });
        map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
        L.control.zoom({ position: 'bottomright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
        }).addTo(map);
        // El modal cambia de tamaño al girar el celular o al sumar la leyenda de la ruta
        observer = new ResizeObserver(() => map?.invalidateSize());
        observer.observe(container);
        setLeaflet({ L, map });
      },
      () => { if (!cancelled) setFailed(true); },
    );

    return () => {
      cancelled = true;
      observer?.disconnect();
      map?.remove();
    };
  }, [options]);

  return { containerRef, leaflet, failed };
}
