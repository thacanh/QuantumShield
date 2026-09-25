import type { ExperimentResult } from '../../../types/experiment';
import type { LearningContext, LearningOutcome } from '../../../types/learning';
import type { SystemGraph } from '../../../types/system';
import { calculateInvoice, reconciliationCorrect } from './finance/invoice.ts';
import { authorizationControls } from './finance/paymentAuthorization.ts';

export function scenarioDesignIssues(graph: SystemGraph, context: LearningContext): string[] {
  const b = context.bindings, errors: string[] = [];
  const node = (id: string) => graph.nodes.find(n => n.id === id);
  const session = graph.qkdSessions.find(s => s.id === b.sessionId);
  const edge = graph.edges.find(e => e.id === b.dataEdgeId);
  const trusted = context.experienceId === 'q_authorization_vault';
  if (node(b.senderNodeId)?.type !== 'participant' || node(b.receiverNodeId)?.type !== 'participant') errors.push('Thiếu hoặc đổi vai trò bên gửi/bên nhận của bài học.');
  if (!session || session.protocol !== (trusted ? 'trusted_distributor' : 'direct_bb84') || session.participantIds[0] !== b.senderNodeId || session.participantIds[1] !== b.receiverNodeId) errors.push('Phiên QKD của bài học đã bị xóa hoặc đổi hai bên/giao thức.');
  if (trusted && (!b.distributorNodeId || node(b.distributorNodeId)?.type !== 'key_distributor' || session?.distributorId !== b.distributorNodeId)) errors.push('Thiếu bên phân phối khóa Charlie của bài học.');
  const paths = b.pathIds.map(id => graph.quantumPaths.find(p => p.id === id));
  if (paths.length !== (trusted ? 2 : 1) || session?.pathIds.length !== paths.length || paths.some((p, i) => !p || p.sessionId !== b.sessionId || !session?.pathIds.includes(b.pathIds[i]) || p.source !== (trusted ? b.distributorNodeId : b.senderNodeId) || p.target !== (trusted && i === 0 ? b.senderNodeId : b.receiverNodeId))) errors.push('Đường QKD gắn với bài học thiếu hoặc đổi đầu phát/đầu thu.');
  if (!edge || edge.source !== b.senderNodeId || edge.target !== b.receiverNodeId || edge.config.protection !== 'aes_256_gcm') errors.push('Thiếu đường dữ liệu AES-256-GCM đúng chiều của bài học.');
  else if (edge.config.keySource !== 'auto' && edge.config.keySource !== b.sessionId) errors.push('Đường dữ liệu phải dùng khóa của phiên QKD bài học.');
  else if (edge.config.keySource === 'auto' && graph.qkdSessions.filter(s => s.participantIds.includes(b.senderNodeId) && s.participantIds.includes(b.receiverNodeId)).length !== 1) errors.push('Nguồn khóa không rõ: chọn chính xác phiên QKD của bài học cho đường dữ liệu.');
  return errors;
}

export function financeReadiness(context: LearningContext): { ready: boolean; reasons: string[] } {
  if (context.experienceId === 'q_authorization_vault') return authorizationControls(context.finance);
  const f = context.finance, result = calculateInvoice(f.invoice, f.payments, f.today);
  if (result.errors.length) return { ready: false, reasons: result.errors };
  if (!f.reconciled || !reconciliationCorrect(f)) return { ready: false, reasons: ['Chọn đúng các khoản đã thanh toán có cùng tham chiếu hóa đơn và hoàn tất đối chiếu trước khi gửi.'] };
  return { ready: true, reasons: [] };
}

export function financialPayload(context: LearningContext): string {
  if (context.experienceId === 'electronic_invoice') {
    const f = context.finance, r = calculateInvoice(f.invoice, f.payments, f.today);
    if (r.errors.length) return '';
    return JSON.stringify({ type: 'invoice_reconciliation_snapshot',
      invoice: { invoice_id: f.invoice.invoiceId, customer_id: 'KH-DEMO-00128', seller_name: f.invoice.sellerName,
        customer_name: f.invoice.customerName, customer_tax_id: f.invoice.customerTaxId, issue_date: f.invoice.issueDate,
        due_date: f.invoice.dueDate, lines: f.invoice.lines, subtotal_vnd: r.subtotal, illustrative_tax_vnd: r.tax, discount_vnd: f.invoice.discountVnd, total_vnd: r.total },
      reconciliation: { as_of_date: f.today, matched_payment_ids: r.matchedIds, matched_paid_vnd: r.matchedPaid, outstanding_vnd: r.outstanding, collection_status: r.status }, note: '',
    }, null, 2);
  }
  const p = context.finance;
  if (!authorizationControls(p).ready) return '';
  return JSON.stringify({ type: 'q_authorization_capsule', instruction_id: p.instructionId, payer_token: p.payerToken,
    beneficiary_token: p.beneficiaryToken, amount_vnd: p.amountVnd, purpose: p.purpose,
    business_checks: { available_balance: 'PASS', per_transaction_limit: 'PASS', daily_limit: 'PASS', beneficiary: 'PASS' },
    compliance: { kyc: p.kycStatus, risk: p.riskStatus },
    authorization: { maker: p.makerDecision, checker: p.checkerDecision, maker_id: p.maker, checker_id: p.checker },
    created_at: context.createdAt, note: '',
  }, null, 2);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function payloadIssue(context: LearningContext, plaintext: string): string | undefined {
  try {
    const actual = JSON.parse(plaintext), expected = JSON.parse(financialPayload(context));
    if (!actual || Array.isArray(actual) || typeof actual !== 'object') throw new Error();
    if (actual.note !== undefined && typeof actual.note !== 'string') throw new Error();
    delete actual.note; delete expected.note;
    if (canonical(actual) !== canonical(expected)) return 'Nội dung gửi không khớp tình huống bài học. Tạo lại bản chụp từ bài tập; bạn có thể sửa ghi chú “note” trong JSON.';
  } catch { return 'Nội dung phải là JSON của bản chụp bài tập. Hoàn tất kiểm soát rồi tạo lại nội dung gửi.'; }
}

function securityOutcome(context: LearningContext, graph: SystemGraph, result?: ExperimentResult, plaintext = financialPayload(context)): LearningOutcome {
  const issues = scenarioDesignIssues(graph, context);
  if (issues.length) return { status: 'DESIGN_INCOMPLETE', title: 'Thiết kế bài học chưa đầy đủ', reasons: issues, success: false };
  const hold = (reason: string): LearningOutcome => ({ status: context.experienceId === 'electronic_invoice' ? 'TRANSMISSION_BLOCKED' : 'HOLD_QKD', title: 'Chờ truyền dữ liệu an toàn', reasons: [reason], success: false });
  if (!result) return hold('Chưa có kết quả QKD + Dữ liệu cho bài tập này.');
  if (result.scope !== 'qkd' || scenarioDesignIssues(result.graphSnapshot, context).length) return hold('Lần chạy chưa thực hiện đầy đủ QKD + Dữ liệu với các liên kết của bài học.');
  const session = result.sessions.find(s => s.sessionId === context.bindings.sessionId);
  const data = result.dataResults?.find(d => d.edgeId === context.bindings.dataEdgeId);
  if (data?.diagnostic === 'AES_GCM_INTEGRITY_CHECK_FAILED' || data?.diagnostic === 'AES_GCM_AUTHENTICATION_FAILED' || (data?.applicationStatus === 'encrypted' && data.transmissionStatus === 'delivered' && !data.integrityVerified)) return {
    status: context.experienceId === 'q_authorization_vault' ? 'REJECTED' : 'TRANSMISSION_BLOCKED', title: 'Không chấp nhận dữ liệu: xác minh toàn vẹn thất bại', reasons: ['Bên nhận không được tin cậy gói dữ liệu này. Sổ công nợ và số dư trong bài tập không bị thay đổi.'], success: false,
  };
  if (!session || session.qkdStatus !== 'completed') return hold(context.experienceId === 'electronic_invoice'
    ? 'QKD chưa hoàn tất hoặc đã bị hủy. Bản ghi tài chính giữ nguyên tại nơi gửi; hóa đơn không vì thế trở thành không hợp lệ.'
    : 'QKD chưa hoàn tất hoặc đã bị hủy. Lệnh đã đạt kiểm soát nghiệp vụ nhưng phải chờ kênh truyền an toàn; số dư không thay đổi.');
  if ((session.finalKeyLength ?? 0) < 256 || session.keyStatus !== 'verified') return hold(`QKD đã hoàn tất, nhưng khóa ${session.finalKeyLength ?? 0}/256 bit hoặc chưa xác minh: ứng dụng AES-256 chưa sẵn sàng.`);
  if (data?.sessionId !== context.bindings.sessionId || data.protection !== 'aes_256_gcm' || data.applicationStatus !== 'encrypted' || data.transmissionStatus !== 'delivered' || !data.integrityVerified) return hold('Chưa có bản chụp được AES-256-GCM mã hóa, giao đến đúng bên nhận và xác minh toàn vẹn.');
  const invalidPayload = payloadIssue(context, plaintext);
  if (invalidPayload || data.decryptedPayload !== plaintext) return hold(invalidPayload ?? 'Nội dung bên nhận chưa được đối chiếu trùng với bản chụp bài tập đã gửi.');
  return { status: context.experienceId === 'electronic_invoice' ? 'PROTECTED_DELIVERED' : 'AUTHORIZED',
    title: context.experienceId === 'electronic_invoice' ? 'Đã bảo vệ và giao bản chụp công nợ' : 'Được phê duyệt để gửi xử lý thanh toán',
    reasons: ['Khóa chung đã xác minh; AES-256-GCM đã mã hóa; bên nhận xác minh toàn vẹn và nhận đúng nội dung đã gửi.'], success: true };
}

export function deriveInvoiceOutcome(context: LearningContext, graph: SystemGraph, result?: ExperimentResult, plaintext?: string): LearningOutcome {
  const readiness = financeReadiness(context);
  if (!readiness.ready) return { status: 'DRAFT', title: 'Chưa hoàn tất bài tập đối chiếu', reasons: readiness.reasons, success: false };
  return securityOutcome(context, graph, result, plaintext);
}
export function deriveAuthorizationOutcome(context: LearningContext, graph: SystemGraph, result?: ExperimentResult, plaintext?: string): LearningOutcome {
  if (context.experienceId !== 'q_authorization_vault') throw new Error('Invalid authorization context');
  const controls = authorizationControls(context.finance);
  if (!controls.ready) return { status: controls.decision, title: decisionLabels[controls.decision], reasons: controls.reasons, success: false };
  return securityOutcome(context, graph, result, plaintext);
}
export const decisionLabels: Record<string, string> = { DRAFT: 'Bản nháp', PENDING_APPROVAL: 'Chờ phê duyệt', HOLD_COMPLIANCE: 'Tạm giữ để rà soát tuân thủ', HOLD_QKD: 'Tạm giữ: chưa sẵn sàng truyền an toàn', AUTHORIZED: 'Được phê duyệt để gửi', REJECTED: 'Từ chối', DESIGN_INCOMPLETE: 'Thiết kế bài học chưa đầy đủ', PROTECTED_DELIVERED: 'Đã bảo vệ và giao', TRANSMISSION_BLOCKED: 'Chưa truyền an toàn' };
