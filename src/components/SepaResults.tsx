import { ReactNode } from 'react';
import { formatSize } from '@/lib/format';
import { SepaProduct } from '@/lib/sepa';
import { SepaSearchState } from './useSepaSearch';

interface Props {
  search: SepaSearchState;
  /** Envuelve `info` (los datos del producto) en la fila: un botón o un link con la clase `.list-row` */
  renderItem: (product: SepaProduct, info: ReactNode) => ReactNode;
  /** Línea opcional debajo de los datos del producto (el resumen de precios en Buscar) */
  renderDetails?: (product: SepaProduct) => ReactNode;
}

function statusMessage({ status, results }: SepaSearchState): string | null {
  if (status === 'loading') return 'Buscando…';
  if (status === 'done' && results.length === 0) return 'Sin resultados';
  return null;
}

function resultCount(count: number): string {
  return count === 1 ? '1 resultado' : `${count} resultados`;
}

function chainCount(count: number): string {
  return count === 1 ? 'en 1 cadena' : `en ${count} cadenas`;
}

function ProductInfo({ product, extra }: { product: SepaProduct; extra?: ReactNode }) {
  const size = product.size !== null && product.sizeUnit ? formatSize(product.size, product.sizeUnit) : null;
  const details = [product.brand, size, chainCount(product.banderas)].filter(Boolean).join(' · ');

  return (
    <span className="min-w-0 flex-1">
      <span className="block font-semibold break-words">{product.description}</span>
      <span className="block text-sm text-gray-600 break-words">{details}</span>
      {extra}
    </span>
  );
}

/** Mensajes y lista de una búsqueda en el catálogo. La región `status` queda siempre montada para que se anuncie */
export default function SepaResults({ search, renderItem, renderDetails }: Props) {
  const message = statusMessage(search);
  const { results } = search;

  return (
    <div>
      <div role="status">
        {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}
        {results.length > 0 && <span className="sr-only">{resultCount(results.length)}</span>}
      </div>

      {search.status === 'error' && (
        <p role="alert" className="mt-2 text-sm text-red-700">No se pudo consultar Precios Claros</p>
      )}

      {results.length > 0 && (
        <>
          <ul className="mt-3 border border-gray-200 rounded-lg divide-y divide-gray-200 overflow-hidden bg-white">
            {results.map(product => (
              <li key={product.ean}>{renderItem(product, <ProductInfo product={product} extra={renderDetails?.(product)} />)}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">Datos: Precios Claros — SEPA (CC-BY-4.0)</p>
        </>
      )}
    </div>
  );
}
