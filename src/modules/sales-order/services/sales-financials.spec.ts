import { calculateDeliveryInvoiceTotals } from './customer-invoice.service';
import { calculateCogs } from './delivery-order.service';

describe('sales financial calculations', () => {
  it('calculates a partial delivery invoice from delivered quantity', () => {
    expect(
      calculateDeliveryInvoiceTotals([
        { quantity: 40, unitPrice: 150, discountPct: 10, taxPct: 11 },
      ]),
    ).toEqual({ subtotal: 5400, taxAmount: 594, totalAmount: 5994 });
  });

  it('uses cost price for COGS instead of sales price', () => {
    expect(calculateCogs([{ quantity: 40, costPrice: 90 }])).toBe(3600);
  });
});
