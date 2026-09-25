import type { FinancialDecision, PaymentInstruction } from '../../../../types/learning';
import { validMoney } from './invoice.ts';

export interface ControlCheck { label: string; passed: boolean; reason: string }
export function businessChecks(p: PaymentInstruction): ControlCheck[] {
  return [
    { label: 'Số tiền và nội dung lệnh', passed: validMoney(p.amountVnd) && p.amountVnd > 0 && !!p.purpose.trim(), reason: 'Số tiền phải là số đồng nguyên dương và có mục đích thanh toán.' },
    { label: 'Số dư khả dụng', passed: validMoney(p.availableBalanceVnd) && p.amountVnd <= p.availableBalanceVnd, reason: 'Không đủ số dư khả dụng hoặc số dư không hợp lệ.' },
    { label: 'Hạn mức mỗi giao dịch', passed: validMoney(p.perTransactionLimitVnd) && p.amountVnd <= p.perTransactionLimitVnd, reason: 'Vượt hạn mức mỗi giao dịch hoặc hạn mức không hợp lệ.' },
    { label: 'Hạn mức ngày còn lại', passed: validMoney(p.dailyLimitRemainingVnd) && p.amountVnd <= p.dailyLimitRemainingVnd, reason: 'Vượt hạn mức ngày còn lại hoặc hạn mức không hợp lệ.' },
    { label: 'Kiểm tra người thụ hưởng', passed: p.beneficiaryStatus === 'VALIDATED', reason: p.beneficiaryStatus === 'BLOCKED' ? 'Người thụ hưởng bị chặn trong bài tập.' : 'Người thụ hưởng chưa được xác minh trước khi gửi.' },
  ];
}

export function authorizationControls(p: PaymentInstruction): { decision: FinancialDecision; reasons: string[]; ready: boolean } {
  const failures = businessChecks(p).filter(c => !c.passed).map(c => c.reason);
  if (p.kycStatus === 'INVALID') failures.push('KYC không hợp lệ trong dữ liệu giả lập.');
  if (p.riskStatus === 'BLOCKED') failures.push('Trạng thái rủi ro bị chặn.');
  if (p.maker.trim().toLocaleLowerCase() === p.checker.trim().toLocaleLowerCase()) failures.push('Vi phạm phân tách nhiệm vụ: người lập và người duyệt phải khác nhau.');
  if (p.makerDecision === 'REJECTED' || p.checkerDecision === 'REJECTED') failures.push('Người lập hoặc người duyệt đã từ chối lệnh.');
  if (failures.length) return { decision: 'REJECTED', reasons: failures, ready: false };
  if (![p.instructionId, p.payerToken, p.beneficiaryToken, p.maker, p.checker].every(v => v.trim())) return { decision: 'DRAFT', reasons: ['Bổ sung mã lệnh, mã các bên và hai vai trò giả lập.'], ready: false };
  if (p.kycStatus === 'REVIEW_REQUIRED' || p.riskStatus === 'REVIEW_REQUIRED') return { decision: 'HOLD_COMPLIANCE', reasons: ['Tạm giữ để rà soát tuân thủ; đây chưa phải quyết định từ chối.'], ready: false };
  if (p.kycStatus !== 'VALID' || !['LOW', 'MEDIUM'].includes(p.riskStatus)) return { decision: 'REJECTED', reasons: ['Trạng thái tuân thủ không được hỗ trợ.'], ready: false };
  if (p.makerDecision !== 'APPROVED' || p.checkerDecision !== 'APPROVED') return { decision: 'PENDING_APPROVAL', reasons: ['Cần hai quyết định đồng ý từ người lập và người duyệt độc lập.'], ready: false };
  return { decision: 'HOLD_QKD', reasons: ['Các kiểm soát bài tập đã đạt; cần bảo vệ và giao gói lệnh qua QKD + AES.'], ready: true };
}

export function createPaymentInstruction(): PaymentInstruction {
  return { instructionId: 'PAY-DEMO-0001', payerToken: 'PB-X-DEMO', beneficiaryToken: 'BEN-DEMO-9021',
    amountVnd: 5000000000, purpose: 'Thanh toán thiết bị trong bài tập', availableBalanceVnd: 8000000000,
    perTransactionLimitVnd: 6000000000, dailyLimitRemainingVnd: 7000000000,
    beneficiaryStatus: 'VALIDATED', kycStatus: 'VALID', riskStatus: 'MEDIUM',
    maker: 'NV-DEMO-01', checker: 'NV-DEMO-02', makerDecision: 'PENDING', checkerDecision: 'PENDING' };
}
