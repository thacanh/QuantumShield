import type { CollectionStatus, EducationalInvoice, InvoiceExercise, PaymentRecord } from '../../../../types/learning';

export const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
export const validMoney = (value: number) => Number.isSafeInteger(value) && value >= 0;
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export const collectionLabels: Record<CollectionStatus, string> = {
  UNPAID: 'Chưa thanh toán', PARTIALLY_PAID: 'Thanh toán một phần', PAID: 'Đã thanh toán', OVERDUE: 'Quá hạn',
};

export function calculateInvoice(invoice: EducationalInvoice, payments: PaymentRecord[], today: string) {
  const errors: string[] = [];
  if (!invoice.invoiceId.trim() || !invoice.lines.length) errors.push('Hóa đơn cần mã tham chiếu và ít nhất một dòng hàng.');
  if (![invoice.issueDate, invoice.dueDate, today].every(validDate) || invoice.dueDate < invoice.issueDate) errors.push('Ngày hóa đơn, hạn trả và ngày đối chiếu phải hợp lệ; hạn trả không trước ngày lập.');
  if (invoice.lines.some(l => !l.description.trim() || !Number.isSafeInteger(l.quantity) || l.quantity <= 0 || !validMoney(l.unitPriceVnd))) errors.push('Số lượng phải là số nguyên dương, đơn giá là số đồng không âm.');
  if (!Number.isFinite(invoice.taxRate) || invoice.taxRate < 0 || invoice.taxRate > 1 || !validMoney(invoice.discountVnd)) errors.push('Thuế minh họa hoặc chiết khấu không hợp lệ.');
  if (new Set(payments.map(p => p.paymentId)).size !== payments.length || payments.some(p => !p.paymentId.trim() || !validMoney(p.amountVnd) || !validDate(p.valueDate) || !['settled', 'pending', 'reversed'].includes(p.status))) errors.push('Bản ghi thanh toán phải có mã duy nhất, số tiền và ngày hợp lệ.');
  const subtotal = invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceVnd, 0);
  const tax = Math.round(subtotal * invoice.taxRate);
  const total = subtotal + tax - invoice.discountVnd;
  const matched = payments.filter(p => p.invoiceReference === invoice.invoiceId && p.status === 'settled');
  const matchedPaid = matched.reduce((sum, p) => sum + p.amountVnd, 0);
  if (![subtotal, tax, total, matchedPaid].every(validMoney)) errors.push('Tổng tiền vượt giới hạn số nguyên an toàn hoặc chiết khấu vượt tổng hóa đơn.');
  const outstanding = Math.max(0, total - matchedPaid);
  const overpayment = Math.max(0, matchedPaid - total);
  const status: CollectionStatus = outstanding <= 0 ? 'PAID' : today > invoice.dueDate ? 'OVERDUE' : matchedPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
  return { subtotal, tax, total, matchedPaid, outstanding, overpayment, status, matchedIds: matched.map(p => p.paymentId), errors };
}

export function reconciliationCorrect(exercise: InvoiceExercise): boolean {
  const result = calculateInvoice(exercise.invoice, exercise.payments, exercise.today);
  const selected = new Set(exercise.selectedPaymentIds);
  return !result.errors.length && selected.size === result.matchedIds.length && result.matchedIds.every(id => selected.has(id));
}

export function createInvoiceExercise(): InvoiceExercise {
  return {
    invoice: { invoiceId: 'HD-DEMO-00128', sellerName: 'Chi nhánh Minh Họa', customerName: 'Công ty Văn Phòng DEMO', customerTaxId: 'MST-DEMO-00128',
      issueDate: '2026-09-23', dueDate: '2026-10-15', taxRate: 0.1, discountVnd: 0,
      lines: [{ id: 'line-1', description: 'Thiết bị văn phòng đã bàn giao', quantity: 2, unitPriceVnd: 5000000 }] },
    payments: [
      { paymentId: 'TT-DEMO-A', invoiceReference: 'HD-DEMO-00128', amountVnd: 6000000, valueDate: '2026-09-23', status: 'settled' },
      { paymentId: 'TT-DEMO-B', invoiceReference: 'HD-DEMO-00777', amountVnd: 2000000, valueDate: '2026-09-23', status: 'settled' },
      { paymentId: 'TT-DEMO-C', invoiceReference: 'HD-DEMO-00128', amountVnd: 1000000, valueDate: '2026-09-23', status: 'pending' },
      { paymentId: 'TT-DEMO-D', invoiceReference: 'HD-DEMO-00128', amountVnd: 1000000, valueDate: '2026-09-23', status: 'reversed' },
    ], today: '2026-09-23', selectedPaymentIds: [], reconciled: false,
  };
}
