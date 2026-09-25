import type { ExperimentResult } from '../../../types/experiment';
import type { LearningContext } from '../../../types/learning';
import type { SystemGraph } from '../../../types/system';
import { vi } from '../../../i18n/vi';
import { calculateInvoice, collectionLabels, money } from './finance/invoice';
import { deriveAuthorizationOutcome, deriveInvoiceOutcome } from './outcomes';

export default function LearningInterpretationPanel({ context, graph, result, plaintext, stale = false }: {
  context: LearningContext; graph: SystemGraph; result?: ExperimentResult; plaintext?: string; stale?: boolean;
}) {
  const outcome = context.experienceId === 'electronic_invoice'
    ? deriveInvoiceOutcome(context, graph, result, plaintext) : deriveAuthorizationOutcome(context, graph, result, plaintext);
  const session = result?.sessions.find(s => s.sessionId === context.bindings.sessionId);
  const data = result?.dataResults?.find(d => d.edgeId === context.bindings.dataEdgeId);
  const invoice = context.experienceId === 'electronic_invoice' ? calculateInvoice(context.finance.invoice, context.finance.payments, context.finance.today) : undefined;
  return <section className="learning-interpretation" aria-label="Kết quả học tập tài chính">
    <span className="learning-kicker">03 · KẾT QUẢ THỰC NGHIỆM</span><h2>Kết quả học tập tài chính</h2>
    {stale && <p className="learning-stale" role="status">Đây là kết quả của bản chụp lúc chạy. Bài tập, thiết kế hoặc nội dung gửi đã thay đổi; kết quả này không áp dụng cho bản hiện tại. Hãy chạy lại sau khi hoàn tất kiểm soát.</p>}
    <div className={`learning-decision ${outcome.success ? 'is-success' : outcome.status === 'REJECTED' ? 'is-blocked' : ''}`}>
      <h3>{outcome.title}{stale ? ' · Lần chạy trước' : ''}</h3>{outcome.reasons.map(reason => <p key={reason}>{reason}</p>)}
    </div>
    {invoice && !invoice.errors.length && <div className="learning-metrics"><div><span>Tổng hóa đơn lúc chạy</span><strong>{money(invoice.total)}</strong></div><div><span>Đã đối chiếu</span><strong>{money(invoice.matchedPaid)}</strong></div><div><span>Còn phải thu</span><strong>{money(invoice.outstanding)}</strong></div><div><span>Trạng thái thu nợ · bài tập</span><strong>{collectionLabels[invoice.status]}</strong></div></div>}
    {context.experienceId === 'q_authorization_vault' && <p><strong>Lệnh {context.finance.instructionId} · {money(context.finance.amountVnd)}.</strong> Được phê duyệt để gửi ≠ đã quyết toán. Không chuyển tiền, không ghi nợ/ghi có; số dư khả dụng vẫn là {money(context.finance.availableBalanceVnd)}. Đây là vai trò giả lập, không phải cơ chế phân quyền ngân hàng thật.</p>}
    <div className="learning-control-grid"><section><h3>Nghiệp vụ</h3><p>{invoice ? 'Đối chiếu khoản thanh toán đúng hóa đơn. Thay kênh hoặc thêm Eve không đổi công nợ.' : 'Số dư, hạn mức, bên nhận, tuân thủ và hai phê duyệt độc lập được kiểm tra trước khi gửi.'}</p></section>
      <section><h3>QKD / vật liệu khóa</h3><p>{session ? `${vi(session.qkdStatus)} · ${session.finalKeyLength ?? 0} bit khóa cuối · ${vi(session.keyStatus)}` : 'Chưa chạy'}</p><p>Hoàn tất QKD vẫn có thể không đủ 256 bit cho AES.</p></section>
      <section><h3>Giao dữ liệu / toàn vẹn</h3><p>{data ? `${vi(data.applicationStatus)} · ${vi(data.transmissionStatus)} · ${data.integrityVerified ? 'Đã xác minh toàn vẹn' : 'Chưa xác minh toàn vẹn'}` : 'Chưa gửi'}</p><p>AES bảo vệ nội dung; kênh an toàn không chứng minh số liệu nghiệp vụ đúng. Nếu bản mã bị sửa, kiểm tra toàn vẹn phải thất bại và bên nhận không được tin dữ liệu.</p></section>
    </div>
    <p>{invoice ? 'Thử giữ lần chạy A rồi thêm Eve hoặc đổi SI cho lần chạy B. Công nợ có đổi không? Không: thay đổi là điều kiện truyền dữ liệu an toàn.' : 'So sánh ngưỡng cố định và AI trên cùng sơ đồ, hạt giống, cửa sổ, công suất, góc và Eve. AI thay ngưỡng thu, không làm lệnh sai nghiệp vụ thành hợp lệ.'}</p>
  </section>;
}
