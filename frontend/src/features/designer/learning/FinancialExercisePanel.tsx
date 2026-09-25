import type { DecisionPoint, LearningContext, LearningProgress } from '../../../types/learning';
import { calculateInvoice, money } from './finance/invoice';
import { financeMastered } from './decisions';
import DecisionList from './DecisionList';

export default function FinancialExercisePanel({ context, progress, points, answer, retry, protect }: {
  context: LearningContext; progress: LearningProgress; points: DecisionPoint[];
  answer: (id: string, option: string) => void; retry: (id: string) => void; protect: () => void;
}) {
  const invoice = context.experienceId === 'electronic_invoice' ? context.finance : undefined;
  const payment = context.experienceId === 'q_authorization_vault' ? context.finance : undefined;
  const ready = financeMastered(context, progress);
  return <section className="learning-exercise" aria-label="Thực hành quyết định tài chính">
    <span className="learning-kicker">02 · ĐỌC TÌNH HUỐNG VÀ RA QUYẾT ĐỊNH</span>
    <h2>{invoice ? 'Hóa đơn 11 triệu: khoản nào thực sự đã thu?' : 'Một lệnh 5 tỷ cần đi qua những kiểm soát nào?'}</h2>
    <p>Đây là tình huống cố định. Hãy đọc dữ kiện, chọn cách xử lý rồi xem phản hồi. Chọn sai có thể thử lại; cuối bài sẽ nhắc những điểm bạn cần ôn.</p>
    {invoice && <>
      <div className="learning-invoice-heading"><div><strong>{invoice.invoice.invoiceId}</strong><p>{invoice.invoice.sellerName} → {invoice.invoice.customerName}</p><p>Ngày đối chiếu {invoice.today} · Hạn thanh toán {invoice.invoice.dueDate}</p></div><strong>{money(calculateInvoice(invoice.invoice, invoice.payments, invoice.today).total)}</strong></div>
      <p>2 thiết bị đã bàn giao × 5 triệu = 10 triệu tiền hàng; thuế minh họa 10% là 1 triệu; không chiết khấu. Tổng hóa đơn 11 triệu đồng.</p>
      <div className="lab-table-scroll"><table aria-label="Dữ kiện thanh toán"><thead><tr><th>Khoản tiền</th><th>Mã hóa đơn</th><th>Số tiền</th><th>Trạng thái</th></tr></thead><tbody>{invoice.payments.map(p => <tr key={p.paymentId}><td>{p.paymentId}</td><td>{p.invoiceReference}</td><td>{money(p.amountVnd)}</td><td>{{ settled: 'Đã thanh toán', pending: 'Đang chờ', reversed: 'Đã hoàn/đảo' }[p.status]}</td></tr>)}</tbody></table></div>
    </>}
    {payment && <div className="learning-metrics"><div><span>Số tiền lệnh</span><strong>{money(payment.amountVnd)}</strong></div><div><span>Số dư khả dụng</span><strong>{money(payment.availableBalanceVnd)}</strong></div><div><span>Hạn mức mỗi giao dịch</span><strong>{money(payment.perTransactionLimitVnd)}</strong></div><div><span>Hạn mức ngày còn lại</span><strong>{money(payment.dailyLimitRemainingVnd)}</strong></div></div>}
    <DecisionList points={points} progress={progress} enabled={progress.read} answer={answer} retry={retry} />
    <div className="learning-next">
      <h3>{ready ? '✓ Đã xử lý đúng các quyết định nghiệp vụ' : 'Hoàn thành các quyết định trước khi bảo vệ dữ liệu'}</h3>
      <ul className="learning-checklist">{points.map(q => <li key={q.id}>{progress.answers[q.id]?.solved ? '✓' : '○'} {q.concept}</li>)}</ul>
      {ready && <p>{invoice ? 'Áp dụng kết luận: ghép khoản A, ghi nhận đã thu 6 triệu và còn phải thu 5 triệu; tạo bản chụp để gửi trung tâm kế toán.' : 'Tình huống tiếp diễn: bộ phận rà soát giả lập xác nhận KYC hợp lệ; NV-DEMO-01 lập lệnh và NV-DEMO-02 duyệt độc lập, cả hai đồng ý. Áp dụng nhánh này để tạo gói lệnh giả lập. Việc trả lời đúng không phải phê duyệt ngân hàng thật.'}</p>}
      <button disabled={!ready} onClick={protect}>{progress.applied ? 'Tiếp tục thiết kế hệ QKD →' : 'Áp dụng kết luận & thiết kế hệ QKD →'}</button>
    </div>
  </section>;
}
