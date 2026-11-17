// Medios de pago del checkout. Sin íconos: lib/ no depende de React (los íconos quedan en el carrito)

export interface PaymentMethod {
  id: string;
  label: string;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'efectivo',      label: 'Efectivo'           },
  { id: 'debito',        label: 'Débito'             },
  { id: 'credito1',      label: 'Crédito (1 cuota)'  },
  { id: 'creditoN',      label: 'Crédito en cuotas'  },
  { id: 'transferencia', label: 'Transferencia / QR' },
  { id: 'cheque',        label: 'Cheque'             },
];

export const NO_PAYMENT = 'Sin especificar';

/**
 * Nombre de un medio de pago guardado en una compra. La versión Angular guardaba el id ('efectivo') y la actual
 * guarda el label ('Efectivo'): id o label conocido → label; vacío o ausente → "Sin especificar"; otro valor → tal cual
 */
export function paymentLabel(value: string | undefined): string {
  const text = value?.trim() ?? '';
  if (!text) return NO_PAYMENT;
  const method = PAYMENT_METHODS.find(m => m.id === text || m.label === text);
  return method ? method.label : text;
}
