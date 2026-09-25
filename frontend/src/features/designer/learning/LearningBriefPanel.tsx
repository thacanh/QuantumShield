import type { LearningContext } from '../../../types/learning';

export default function LearningBriefPanel({ context, start }: { context: LearningContext; start: () => void }) {
  const invoice = context.experienceId === 'electronic_invoice';
  return <section className="learning-brief" aria-label="Kiến thức bài học">
    <div><span className="learning-kicker">01 · HIỂU NGHIỆP VỤ</span><h3>{invoice ? 'Lập hóa đơn chưa có nghĩa là đã thu tiền' : 'Phê duyệt lệnh chưa có nghĩa là tiền đã chuyển'}</h3>
      {invoice ? <>
        <p>Chi nhánh đã bàn giao thiết bị văn phòng và có quyền thu tiền không kèm điều kiện khác. Bài tập giả định điều kiện ghi nhận doanh thu đã được đáp ứng, để tập trung vào công nợ và đối chiếu thanh toán.</p>
        <p><strong>Hóa đơn ≠ doanh thu ≠ tiền đã thu.</strong> Ngoài thực tế, ghi nhận doanh thu phụ thuộc hợp đồng và việc chuyển giao hàng hóa/dịch vụ. Khoản phải thu thể hiện quyền thu tiền; thanh toán đúng tham chiếu mới giảm công nợ của hóa đơn này.</p>
      </> : <>
        <p>Kiểm tra lệnh, số dư khả dụng, hạn mức và bên nhận. Sau đó thực hành rà soát tuân thủ và hai vai trò độc lập: người lập tạo lệnh; người duyệt phê duyệt hoặc từ chối.</p>
        <p><strong>Khởi tạo → phê duyệt → gửi xử lý → bù trừ → quyết toán.</strong> Bài tập dừng ở phê duyệt và giao gói lệnh an toàn. Không ghi nợ, ghi có hoặc thay đổi số dư.</p>
      </>}
    </div>
    <p className="learning-reading-time">Dành khoảng 3–5 phút đọc và tự giải thích các ví dụ trước khi xử lý tình huống.</p>
    <h3>Mục tiêu bài học</h3>
    <ul>{(invoice ? ['Phân biệt hóa đơn, doanh thu và tiền thực thu.', 'Ghép đúng thanh toán theo tham chiếu và trạng thái.', 'Tính khoản phải thu, nhận biết thanh toán một phần và quá hạn.', 'Giải thích vì sao gửi bản chụp an toàn không làm thay đổi công nợ.'] : ['So sánh số tiền với số dư khả dụng và các hạn mức.', 'Phân biệt từ chối với tạm giữ để rà soát.', 'Hiểu kiểm tra người thụ hưởng, KYC và rủi ro giả lập.', 'Áp dụng nguyên tắc người lập–người duyệt độc lập.', 'Phân biệt phê duyệt để gửi với quyết toán; tách nghiệp vụ khỏi QKD/AES.']).map(item => <li key={item}>{item}</li>)}</ul>
    <ol className="learning-lifecycle">{(invoice ? ['Đọc hóa đơn', 'Kiểm tra thanh toán', 'Đối chiếu tham chiếu', 'Tính công nợ', 'Bảo vệ bản chụp', 'Giao dữ liệu'] : ['Tạo lệnh', 'Số dư & hạn mức', 'Người thụ hưởng', 'KYC / rủi ro', 'Người lập–người duyệt', 'Bảo vệ dữ liệu', 'Gửi xử lý tiếp']).map(step => <li key={step}>{step}</li>)}</ol>
    <div className="learning-knowledge-grid">{(invoice ? [
      ['Hóa đơn, doanh thu và tiền đã thu', 'Hóa đơn ghi nhận thông tin bán hàng và yêu cầu thanh toán. Doanh thu gắn với việc thực hiện nghĩa vụ theo hợp đồng; tiền đã thu là một sự kiện khác. Trong bài này, hàng đã bàn giao và quyền thu tiền không có điều kiện khác. Không suy rộng rằng mọi hóa đơn đều tự tạo doanh thu trong thực tế.'],
      ['Ghép đúng khoản thanh toán', 'Kiểm tra cả mã tham chiếu hóa đơn lẫn trạng thái. Một khoản đã thanh toán nhưng thuộc hóa đơn khác không giảm công nợ đang xem. Khoản đang chờ chưa được tính là đã thu; khoản đã hoàn/đảo cũng không được cộng. Tránh chỉ nhìn tổng tiền trên bảng rồi trừ tất cả.'],
      ['Từ số tiền đến trạng thái công nợ', 'Trong bài tập: còn phải thu = tổng hóa đơn − tiền đã thanh toán khớp mã, tối thiểu bằng 0. Ví dụ hóa đơn 11 triệu, thu đúng 6 triệu thì còn 5 triệu, dù đang có thêm 3 triệu chờ xử lý. Trước hạn trả, đó là thanh toán một phần; chỉ gọi quá hạn khi ngày đối chiếu vượt hạn mà vẫn còn nợ.'],
      ['Gửi bản chụp không phải thu tiền', 'Chi nhánh cần gửi số liệu sang kế toán để hai bên có cùng thông tin. Giao thành công một bản chụp không làm khách hàng trả thêm tiền. Nếu truyền bị chặn, hóa đơn không tự mất hiệu lực và công nợ vẫn giữ nguyên ở nơi gửi.'],
    ] : [
      ['Số dư khả dụng và hạn mức', 'Số dư khả dụng là phần tiền có thể dùng cho lệnh, không luôn trùng số dư sổ cái. Lệnh 5 tỷ với 4 tỷ khả dụng không đạt. Với 8 tỷ khả dụng, vẫn cần kiểm tra hạn mức mỗi giao dịch và hạn mức ngày còn lại. Đạt một điều kiện không thay thế hai điều kiện kia. Bài tập không mô phỏng thấu chi hay tiền phong tỏa.'],
      ['Người thụ hưởng, KYC và rủi ro', 'Kiểm tra trước người thụ hưởng giúp phát hiện sai thông tin hoặc một bên nhận bị chặn. KYC liên quan đến nhận biết khách hàng; rà soát rủi ro là kiểm soát khác với kiểm tra tiền. Trong bài này các trạng thái được cung cấp sẵn và hoàn toàn giả lập, không có xác minh danh tính hay AML thật.'],
      ['Từ chối khác tạm giữ', 'Thiếu số dư, vượt hạn mức hay bên nhận bị chặn là lý do không cho lệnh vượt qua quy tắc bài tập. “Cần rà soát” chưa phải kết luận vi phạm: tạm giữ lệnh và chờ kết quả kiểm tra. Không dùng QKD hoặc QBER để quyết định một hồ sơ KYC có hợp lệ hay không.'],
      ['Người lập–người duyệt', 'Người lập tạo lệnh; một người khác kiểm tra và quyết định đồng ý hay từ chối. Sự độc lập giúp hạn chế sai sót và lạm dụng quyền. Người có quyền cao hoặc lệnh nằm trong hạn mức cũng không được tự bỏ qua nguyên tắc này trong bài tập. Hai vai trò trên màn hình là mô phỏng, không phải hệ thống phân quyền ngân hàng.'],
      ['Phê duyệt chưa phải quyết toán', 'Sau khi đạt kiểm soát nghiệp vụ, lệnh còn phải được bảo vệ và giao đến bên xử lý tiếp theo. Giao được gói lệnh không đồng nghĩa tiền đã được ghi nợ, ghi có hoặc quyết toán. Ứng dụng dừng ở gửi lệnh giả lập; kết quả không làm giảm số dư hoặc hạn mức của một tài khoản thật.'],
    ]).map(([title, text]) => <article key={title}><h4>{title}</h4><p>{text}</p></article>)}
      <article><h4>Hai lớp kiểm soát, hai nhiệm vụ</h4><p>Nghiệp vụ quyết định bản ghi có đủ điều kiện để tiếp tục hay không. QKD cung cấp vật liệu khóa; AES-256-GCM bảo vệ nội dung và kiểm tra toàn vẹn. Trong bài thực hành, cần ít nhất 256 bit khóa đã xác minh để dùng AES-256. Khóa chỉ có 192 bit vẫn có thể là kết quả QKD hoàn tất, nhưng ứng dụng chưa sẵn sàng gửi.</p><p>AI chỉ hỗ trợ chọn ngưỡng thu FSO. Eve là bộ thu quang thụ động gần đầu thu: QBER thấp hoặc không tăng không chứng minh Eve không biết gì. Không dùng các chỉ số này để thay thế kiểm tra số dư hoặc phê duyệt.</p></article>
    </div>
    <details><summary>Cơ sở khái niệm và giới hạn bài tập</summary>
      <p><strong>Khái niệm theo chuẩn:</strong> {invoice ? 'phân biệt chuyển giao hàng hóa/dịch vụ, lập hóa đơn và thu tiền.' : 'tách khởi tạo lệnh, bù trừ/quyết toán và kiểm soát độc lập.'}</p>
      <p><strong>Quy ước sư phạm:</strong> số tiền, hạn mức, trạng thái thu nợ, KYC và quyết định trong bài tập là giả lập; không phải quy tắc pháp lý/ngân hàng áp dụng chung. Thuế 10% chỉ minh họa; không tính nghĩa vụ thuế hay phát hành hóa đơn pháp lý.</p>
      <p>AI chỉ điều chỉnh ngưỡng thu FSO; AI không quyết định khách hàng có được chuyển tiền hay không. AES-256-GCM bảo vệ nội dung, QKD cung cấp vật liệu khóa. QKD là một hướng phân phối khóa; PQC cũng là một hướng quan trọng trong bảo mật thời đại lượng tử.</p>
      <p>Eve thụ động không tự tăng QBER; QBER thấp không chứng minh không có Eve. Cascade có sửa trực tiếp dự phòng; thông tin Eve là ước lượng giáo dục, không phải giới hạn bảo mật được chứng minh. Dữ liệu FSO không chứng minh một triển khai ngân hàng/vệ tinh thật; Thorlabs là mô hình tương tự phân cực vật lý.</p>
      <div className="learning-sources"><span>Đọc thêm từ nguồn gốc:</span>
        <a href="https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/" target="_blank" rel="noreferrer">IFRS 15</a>
        <a href="https://www.iso20022.org/payments-standards-evaluation-group" target="_blank" rel="noreferrer">ISO 20022 · Vòng đời thanh toán</a>
        <a href="https://www.bis.org/publications/cpmi-brief-9-safety-and-efficiency-through-payment-pre-validation-spotting-issues-money-moves" target="_blank" rel="noreferrer">BIS/CPMI · Kiểm tra trước lệnh</a>
        <a href="https://www.bis.org/committees/bcbs/basel-framework/standard/bcp/40/inforce/2024-04-25/published/2024-04-25" target="_blank" rel="noreferrer">Basel · Kiểm soát nội bộ</a>
        <a href="https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html" target="_blank" rel="noreferrer">FATF · Khung khuyến nghị</a>
      </div>
    </details>
    <div className="learning-next"><button onClick={start}>Đã đọc · Bắt đầu xử lý tình huống →</button><p>Không chấm điểm tốc độ đọc. Bạn có thể quay lại kiến thức bất cứ lúc nào.</p></div>
  </section>;
}
