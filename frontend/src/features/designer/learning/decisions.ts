import type { DecisionPoint, LearningContext, LearningObservation, LearningProgress } from '../../../types/learning';
import type { ExperimentResult } from '../../../types/experiment';
import { calculateInvoice, collectionLabels, money } from './finance/invoice.ts';
import { deriveAuthorizationOutcome, deriveInvoiceOutcome, financeReadiness, scenarioDesignIssues } from './outcomes.ts';

const choice = (id: string, label: string, explanation: string) => ({ id, label, explanation });
export const emptyProgress = (): LearningProgress => ({ read: false, applied: false, answers: {} });

export function financeDecisions(context: LearningContext): DecisionPoint[] {
  if (context.experienceId === 'q_authorization_vault') {
    const p = context.finance;
    return [
      { id: 'vault-limits', phase: 'finance', concept: 'Số dư và hạn mức',
        situation: `Công ty Minh Họa gửi lệnh ${money(p.amountVnd)}. Số dư khả dụng ${money(p.availableBalanceVnd)}, hạn mức mỗi giao dịch ${money(p.perTransactionLimitVnd)}, hạn mức ngày còn lại ${money(p.dailyLimitRemainingVnd)}. Người thụ hưởng đã được xác minh.`,
        question: 'Lệnh có vượt điều kiện tài chính của bài tập không?', correctId: 'B',
        reminder: 'So sánh số tiền với cả số dư khả dụng, hạn mức mỗi giao dịch và hạn mức ngày. QKD không kiểm tra các điều kiện này.', options: [
          choice('A', 'Có, vì 5 tỷ là số tiền quá lớn', 'Số tiền lớn không tự làm lệnh không hợp lệ. Cần đối chiếu các hạn mức và số dư cụ thể.'),
          choice('B', 'Không, vì đủ số dư và không vượt các hạn mức', `${money(p.amountVnd)} không vượt số dư ${money(p.availableBalanceVnd)}, hạn mức mỗi giao dịch ${money(p.perTransactionLimitVnd)} và hạn mức ngày ${money(p.dailyLimitRemainingVnd)}.`),
          choice('C', 'Chưa thể kiểm tra dù đã có số dư và các hạn mức', 'Tình huống đã cung cấp đủ số liệu cho bước kiểm tra tài chính. Tuân thủ và phê duyệt là những bước tiếp theo.'),
          choice('D', 'Phải chạy QKD trước', 'QKD không kiểm tra số dư hay hạn mức. Điều kiện nghiệp vụ cần được kiểm tra trước lớp bảo vệ dữ liệu.'),
        ] },
      { id: 'vault-compliance', phase: 'finance', concept: 'Tạm giữ khác từ chối',
        situation: 'Ở bước tiếp theo, hồ sơ KYC giả lập được đánh dấu “Cần rà soát”. Chưa có kết luận vi phạm.',
        question: 'Bạn sẽ xử lý lệnh thế nào?', correctId: 'C', reminder: 'Cần rà soát là yêu cầu kiểm tra thêm, chưa phải kết luận giao dịch không hợp lệ.', options: [
          choice('A', 'Cho phép gửi ngay vì đủ tiền', 'Đủ số dư không thay thế kiểm soát tuân thủ. Cần hoàn tất rà soát trước khi gửi.'),
          choice('B', 'Từ chối vĩnh viễn', 'Từ chối và tạm giữ là hai trạng thái khác nhau. “Cần rà soát” chưa đủ cơ sở kết luận giao dịch không hợp lệ.'),
          choice('C', 'Tạm giữ để rà soát', 'Lệnh cần được tạm giữ cho đến khi có kết quả kiểm tra. Đây chưa phải quyết định từ chối.'),
          choice('D', 'Chạy QKD để quyết định', 'QKD đánh giá điều kiện tạo khóa, không xác minh hồ sơ khách hàng hoặc ra quyết định tuân thủ.'),
        ] },
      { id: 'vault-roles', phase: 'finance', concept: 'Người lập–người duyệt độc lập',
        situation: 'Bộ phận rà soát giả lập đã xác nhận hồ sơ hợp lệ. Tuy nhiên, người lập đề nghị tự phê duyệt chính lệnh mình tạo.',
        question: 'Lệnh có vượt qua kiểm soát người lập–người duyệt không?', correctId: 'B', reminder: 'Hai vai trò phê duyệt trong bài tập phải do hai người khác nhau đảm nhiệm. QBER không xác định tính độc lập của vai trò.', options: [
          choice('A', 'Có, nếu người lập có quyền cao', 'Quyền cao không thay thế sự kiểm tra độc lập trong quy tắc của bài tập này.'),
          choice('B', 'Không; cần một người duyệt độc lập', 'Phân tách người lập và người duyệt giúp giảm rủi ro sai sót và lạm dụng. Cần chuyển lệnh cho người duyệt khác.'),
          choice('C', 'Có, vì số tiền nằm trong hạn mức', 'Hạn mức và phân tách nhiệm vụ là hai kiểm soát riêng. Đạt kiểm soát này không thay thế kiểm soát kia.'),
          choice('D', 'Phụ thuộc QBER', 'QBER là chỉ số của quá trình QKD, không liên quan đến việc hai vai trò phê duyệt có độc lập hay không.'),
        ] },
    ];
  }
  const f = context.finance, r = calculateInvoice(f.invoice, f.payments, f.today);
  return [
    { id: 'invoice-match', phase: 'finance', concept: 'Đối chiếu thanh toán',
      situation: `Hóa đơn ${f.invoice.invoiceId} trị giá ${money(r.total)}. Bảng thanh toán có khoản đúng mã đã thanh toán, khoản sai mã, khoản đang chờ và khoản đã hoàn/đảo.`,
      question: 'Khoản nào được dùng để giảm công nợ của hóa đơn này?', correctId: 'A', reminder: 'Chỉ khoản đã thanh toán đúng tham chiếu mới giảm công nợ. Đang chờ, hoàn/đảo hoặc thuộc hóa đơn khác không được cộng.', options: [
        choice('A', 'Chỉ TT-DEMO-A: đã thanh toán, đúng mã hóa đơn', 'Khoản A có trạng thái đã thanh toán và tham chiếu đúng hóa đơn. Các khoản còn lại không thỏa đồng thời hai điều kiện.'),
        choice('B', 'A và B, vì cả hai đều đã thanh toán', 'B thuộc hóa đơn khác. Trạng thái đã thanh toán chưa đủ nếu mã tham chiếu không khớp.'),
        choice('C', 'A và C, vì khoản đang chờ sắp hoàn tất', 'Khoản C đang chờ chưa được coi là đã thanh toán trong bài tập này.'),
        choice('D', 'Tất cả các khoản vì đều xuất hiện trên bảng', 'Cần kiểm tra trạng thái và tham chiếu. Khoản đã hoàn/đảo không còn được tính là tiền đã thu cho hóa đơn.'),
      ] },
    { id: 'invoice-outstanding', phase: 'finance', concept: 'Tính khoản phải thu',
      situation: `Tổng hóa đơn ${money(r.total)}. Khoản đã thanh toán khớp mã là ${money(r.matchedPaid)}. Khoản C trị giá ${money(f.payments.find(p => p.paymentId === 'TT-DEMO-C')?.amountVnd ?? 0)} vẫn đang chờ.`,
      question: 'Công nợ còn lại là bao nhiêu?', correctId: 'B', reminder: 'Còn phải thu = tổng hóa đơn − các khoản đã thanh toán đúng tham chiếu; không trừ khoản đang chờ.', options: [
        choice('A', '2.000.000 ₫', 'Bạn đã tính cả khoản 3 triệu đang chờ. Khoản đó chưa làm giảm công nợ.'),
        choice('B', money(r.outstanding), `${money(r.total)} − ${money(r.matchedPaid)} = ${money(r.outstanding)}. Chỉ khoản đã thanh toán khớp mã được tính.`),
        choice('C', '8.000.000 ₫', 'Cần trừ khoản đã thanh toán 6 triệu, không chỉ trừ khoản 3 triệu đang chờ.'),
        choice('D', money(r.total), 'Đã có khoản 6 triệu khớp hóa đơn; không thể giữ nguyên toàn bộ khoản phải thu ban đầu.'),
      ] },
    { id: 'invoice-status', phase: 'finance', concept: 'Trạng thái thu nợ',
      situation: `Ngày đối chiếu ${f.today}, hạn thanh toán ${f.invoice.dueDate}. Đã thu ${money(r.matchedPaid)}, còn phải thu ${money(r.outstanding)}.`,
      question: 'Trạng thái thu nợ nào đúng theo quy ước bài tập?', correctId: 'B', reminder: 'Đã thu một phần và chưa quá hạn là thanh toán một phần. Lập hóa đơn không đồng nghĩa đã thu đủ tiền.', options: [
        choice('A', 'Chưa thanh toán', 'Đã có khoản thanh toán khớp 6 triệu, nên không còn là chưa thanh toán.'),
        choice('B', collectionLabels[r.status], 'Đã thu một phần, vẫn còn công nợ và ngày đối chiếu chưa vượt hạn thanh toán.'),
        choice('C', 'Đã thanh toán đủ', 'Vẫn còn 5 triệu phải thu. Hóa đơn được lập hay gửi thành công không có nghĩa đã thu đủ tiền.'),
        choice('D', 'Quá hạn', 'Ngày đối chiếu chưa vượt hạn thanh toán của hóa đơn. Còn nợ chưa đồng nghĩa quá hạn.'),
      ] },
  ];
}

export function securityDecisions(context: LearningContext, observation?: LearningObservation): DecisionPoint[] {
  const invoice = context.experienceId === 'electronic_invoice';
  const actualAnswer = !observation ? 'Cần chạy QKD + Dữ liệu để đọc kết quả'
    : observation.outcome.success ? invoice ? `Đã giao bản chụp; vẫn còn phải thu ${money(observation.outstandingVnd ?? 0)}` : 'Được phê duyệt để gửi; chưa phải đã quyết toán'
    : observation.qkdStatus === 'aborted' ? 'QKD bị hủy; giữ nguyên bản ghi nghiệp vụ và chưa gửi an toàn'
    : observation.qkdStatus === 'completed' && observation.finalKeyLength < 256 ? 'QKD hoàn tất nhưng khóa chưa đủ cho AES-256'
    : 'Chưa có gói dữ liệu đạt đầy đủ điều kiện gửi và xác minh';
  return [
    { id: 'security-short-key', phase: 'security', concept: 'QKD hoàn tất khác AES sẵn sàng',
      situation: 'Tình huống minh họa, không phải số liệu lần chạy của bạn: QBER 6,8%, QKD hoàn tất, khóa cuối đã xác minh nhưng chỉ dài 192 bit.',
      question: 'Đã có thể dùng AES-256-GCM để gửi dữ liệu chưa?', correctId: 'B', reminder: 'Trong bài thực hành, AES-256 cần ít nhất 256 bit khóa đã xác minh. QKD hoàn tất vẫn có thể chưa đủ vật liệu khóa.', options: [
        choice('A', 'Có, vì QKD đã hoàn tất', 'Hoàn tất giao thức không đồng nghĩa đủ vật liệu khóa cho ứng dụng. 192 bit chưa đạt yêu cầu 256 bit.'),
        choice('B', 'Chưa, vì khóa cuối chưa đủ 256 bit', '192 bit chưa đủ cho AES-256 trong bài tập. Đây là chưa sẵn sàng ở lớp ứng dụng, không phải tự động hủy QKD.'),
        choice('C', 'Không, vì QBER phải bằng 0', 'QBER không bắt buộc bằng 0. Bài tập hủy khi QBER ≥11%; nút thắt trong tình huống này là độ dài khóa.'),
        choice('D', 'Có, miễn là không có Eve', 'Không có Eve cũng không tạo thêm bit khóa. Vẫn phải đáp ứng yêu cầu độ dài và xác minh khóa.'),
      ] },
    { id: 'security-eve', phase: 'security', concept: 'Eve thụ động và giới hạn của QBER',
      situation: 'Tình huống minh họa: thêm Eve thu quang gần đầu thu, QBER gần như không đổi nhưng ước lượng thông tin Eve biết tăng.',
      question: 'Kết luận nào hợp lý trong mô hình này?', correctId: 'B', reminder: 'Eve là bộ thu quang thụ động, không phải relay. QBER không tăng không chứng minh Eve không thu được thông tin.', options: [
        choice('A', 'Eve chắc chắn không thu được gì vì QBER không tăng', 'Nghe lén thụ động không nhất thiết làm thay đổi phép đo hợp lệ. Không thể suy ra Eve không biết gì chỉ từ QBER.'),
        choice('B', 'QBER không tăng không có nghĩa Eve không thu được thông tin', 'Thông tin Eve ước lượng được tính đến khi rút gọn khóa. Đây là ước lượng giáo dục, không phải bằng chứng bảo mật đầy đủ.'),
        choice('C', 'Phải từ chối nghiệp vụ tài chính ngay', 'Cần đánh giá điều kiện khóa và truyền dữ liệu; sự có mặt của Eve không tự thay đổi số dư, công nợ hay tính hợp lệ nghiệp vụ.'),
        choice('D', 'AI phải khóa tài khoản', 'AI trong ứng dụng chỉ chọn ngưỡng thu FSO, không quản lý tài khoản hay quyết định giao dịch.'),
      ] },
    { id: observation ? `security-result:${observation.id}` : 'security-result:pending', phase: 'security', concept: 'Đọc đúng kết quả thực nghiệm',
      situation: observation ? `Lần chạy ${observation.id.slice(0, 8)}: ${observation.outcome.title}. Khóa cuối ${observation.finalKeyLength} bit. ${observation.integrityVerified ? 'Bên nhận đã xác minh toàn vẹn.' : 'Chưa có xác minh toàn vẹn thành công.'}` : 'Chạy QKD + Dữ liệu với sơ đồ bài học trước khi đưa ra kết luận về kết quả thực nghiệm.',
      question: 'Kết quả vừa chạy cho phép kết luận điều gì?', correctId: 'B', reminder: invoice ? 'Truyền bản chụp công nợ không phải thu tiền. Kết quả kỹ thuật không tự thay đổi khoản phải thu.' : 'Phê duyệt và giao gói lệnh chưa phải quyết toán. Kết quả kỹ thuật không tự ghi nợ/ghi có.', options: [
        choice('A', invoice ? 'Khách hàng đã thanh toán hết vì dữ liệu đã được xử lý' : 'Tiền đã được chuyển và có thể trừ số dư', 'Ứng dụng không thực hiện thanh toán. Kết quả truyền dữ liệu không phải kết quả thu tiền hoặc quyết toán.'),
        choice('B', actualAnswer, observation ? `${observation.outcome.reasons.join(' ')} ${invoice ? 'Công nợ không thay đổi chỉ vì chạy QKD.' : 'Số dư không bị trừ; đây là bài học gửi lệnh giả lập.'}` : 'Hãy chạy thí nghiệm trước.'),
        choice('C', 'Kênh an toàn chứng minh mọi thông tin nghiệp vụ đều đúng', 'Bảo vệ dữ liệu không xác nhận tính đúng đắn của nội dung nghiệp vụ. Các kiểm soát này phải được thực hiện riêng.'),
        choice('D', 'Có thể bỏ qua điều kiện khóa và gửi bản rõ nếu cần', 'Bài học yêu cầu truyền bằng AES-256-GCM với khóa hợp lệ. Không tự bỏ bảo vệ dữ liệu khi điều kiện chưa đạt.'),
      ] },
  ];
}

export function financeMastered(context: LearningContext, progress: LearningProgress): boolean {
  return progress.read && financeDecisions(context).every(q => progress.answers[q.id]?.solved);
}
export function answerDecision(progress: LearningProgress, points: DecisionPoint[], id: string, optionId: string, hasCurrentRun = false): LearningProgress {
  const index = points.findIndex(q => q.id === id), point = points[index];
  if (!progress.read || !point || !point.options.some(o => o.id === optionId) || points.slice(0, index).some(q => !progress.answers[q.id]?.solved)) return progress;
  if (point.phase === 'security' && (!progress.applied || !hasCurrentRun)) return progress;
  const previous = progress.answers[id];
  if (previous?.solved || previous?.selectedId) return progress;
  const solved = point.correctId === optionId;
  return { ...progress, answers: { ...progress.answers, [id]: { selectedId: optionId, attempts: (previous?.attempts ?? 0) + 1, mistakes: (previous?.mistakes ?? 0) + (solved ? 0 : 1), solved } } };
}
export function retryDecision(progress: LearningProgress, id: string): LearningProgress {
  const answer = progress.answers[id];
  return !answer || answer.solved ? progress : { ...progress, answers: { ...progress.answers, [id]: { ...answer, selectedId: undefined } } };
}
export function applyFinanceDecisions(context: LearningContext, progress: LearningProgress): LearningContext {
  if (!financeMastered(context, progress)) throw new Error('Hoàn thành các quyết định nghiệp vụ trước khi mở QKD.');
  const next: LearningContext = context.experienceId === 'electronic_invoice'
    ? { ...context, finance: { ...context.finance, selectedPaymentIds: calculateInvoice(context.finance.invoice, context.finance.payments, context.finance.today).matchedIds, reconciled: true } }
    : { ...context, finance: { ...context.finance, makerDecision: 'APPROVED', checkerDecision: 'APPROVED' } };
  if (!financeReadiness(next).ready) throw new Error('Tình huống chưa đạt kiểm soát nghiệp vụ.');
  return next;
}
export function observeLearningRun(context: LearningContext, result: ExperimentResult, plaintext?: string): LearningObservation | undefined {
  if (result.scope !== 'qkd' || !['completed', 'aborted', 'failed'].includes(result.state) || scenarioDesignIssues(result.graphSnapshot, context).length) return;
  const session = result.sessions.find(s => s.sessionId === context.bindings.sessionId);
  if (!session) return;
  const data = result.dataResults?.find(d => d.edgeId === context.bindings.dataEdgeId);
  return { id: result.id, qkdStatus: session.qkdStatus, qber: session.qber, finalKeyLength: session.finalKeyLength ?? 0, keyStatus: session.keyStatus,
    applicationStatus: data?.applicationStatus ?? 'not_requested', transmissionStatus: data?.transmissionStatus ?? 'not_requested', integrityVerified: data?.integrityVerified ?? false,
    outcome: (context.experienceId === 'electronic_invoice' ? deriveInvoiceOutcome : deriveAuthorizationOutcome)(context, result.graphSnapshot, result, plaintext),
    ...(context.experienceId === 'electronic_invoice' ? { outstandingVnd: calculateInvoice(context.finance.invoice, context.finance.payments, context.finance.today).outstanding } : {}) };
}
