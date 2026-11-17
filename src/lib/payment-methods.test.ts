import { describe, expect, it } from 'vitest';
import { NO_PAYMENT, PAYMENT_METHODS, paymentLabel } from './payment-methods';

describe('paymentLabel', () => {
  it('traduce el id de la versión Angular al label', () => {
    expect(paymentLabel('efectivo')).toBe('Efectivo');
    expect(paymentLabel('transferencia')).toBe('Transferencia / QR');
    expect(paymentLabel('creditoN')).toBe('Crédito en cuotas');
  });

  it('deja igual un label conocido', () => {
    for (const m of PAYMENT_METHODS) expect(paymentLabel(m.label)).toBe(m.label);
  });

  it('sin valor o vacío → "Sin especificar"', () => {
    expect(paymentLabel(undefined)).toBe(NO_PAYMENT);
    expect(paymentLabel('')).toBe(NO_PAYMENT);
    expect(paymentLabel('   ')).toBe(NO_PAYMENT);
  });

  it('un valor desconocido queda tal cual', () => {
    expect(paymentLabel('Vale')).toBe('Vale');
  });
});
