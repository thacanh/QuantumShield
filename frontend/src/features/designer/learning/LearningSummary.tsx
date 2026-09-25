import type { DecisionPoint, LearningObservation, LearningProgress } from '../../../types/learning';

export default function LearningSummary({ points, progress, observation, review, practice, protect }: {
  points: DecisionPoint[]; progress: LearningProgress; observation?: LearningObservation;
  review: () => void; practice: () => void; protect: () => void;
}) {
  const solved = points.filter(q => progress.answers[q.id]?.solved);
  const firstTry = solved.filter(q => progress.answers[q.id]?.attempts === 1);
  const mistakesFor = (q: DecisionPoint) => q.id.startsWith('security-result:')
    ? Object.entries(progress.answers).filter(([id]) => id.startsWith('security-result:')).reduce((sum, [, a]) => sum + a.mistakes, 0)
    : progress.answers[q.id]?.mistakes ?? 0;
  const reviewPoints = points.filter(q => mistakesFor(q) > 0);
  return <section className="learning-exercise learning-summary" aria-label="Tổng kết bài học">
    <span className="learning-kicker">04 · BẠN VỪA HỌC ĐƯỢC GÌ?</span>
    <h2>{solved.length === points.length ? 'Đã hoàn thành các điểm kiểm tra của bài học' : 'Tiến độ học tập của bạn'}</h2>
    <div className="learning-score"><strong>{solved.length}/{points.length}</strong><span>điểm đã xử lý đúng · {firstTry.length} điểm đúng ngay lần đầu</span></div>
    <progress aria-label="Tiến độ điểm kiểm tra" value={solved.length} max={points.length} />
    <p>Kết quả phản ánh các quyết định trong bài tập này; không phải chứng nhận năng lực hay kết quả thanh toán thật. Lỗi được giữ trong phiên để giúp bạn ôn lại.</p>
    <div className="learning-review-grid"><section><h3>Đã xử lý đúng</h3><ul>{solved.length ? solved.map(q => <li key={q.id}>✓ {q.concept}{mistakesFor(q) > 0 ? ' · đã sửa đúng sau phản hồi' : ''}</li>) : <li>Chưa có điểm hoàn thành. Bắt đầu từ bước Thực hành.</li>}</ul>
      <h3>Chưa hoàn thành</h3><ul>{points.filter(q => !progress.answers[q.id]?.solved).map(q => <li key={q.id}>○ {q.concept}</li>)}{solved.length === points.length && <li>Không còn điểm chưa hoàn thành.</li>}</ul></section>
      <section><h3>Cần ôn lại</h3>{reviewPoints.length ? reviewPoints.map(q => <article key={q.id}><strong>{q.concept} · {mistakesFor(q)} lần chọn chưa đúng</strong><p>{q.reminder}</p></article>) : <p>{solved.length ? 'Chưa ghi nhận lựa chọn sai trong phiên. Hãy giải thích lại bằng lời của mình để củng cố kiến thức.' : 'Các điểm cần ôn sẽ hiện sau khi bạn trả lời.'}</p>}</section></div>
    <section className="learning-decision"><h3>Liên hệ với lần chạy QKD</h3>{observation ? <><p>{observation.outcome.title} · {observation.finalKeyLength} bit khóa cuối.</p><p>Hoàn thành bài học không đòi hỏi thí nghiệm luôn truyền thành công. Hiểu đúng lý do bị chặn cũng là một kết quả học tập.</p></> : <p>Chưa có kết quả QKD + Dữ liệu áp dụng cho thiết kế hiện tại. Hoàn tất nghiệp vụ rồi chạy ở bước Bảo vệ để mở câu hỏi kỹ thuật.</p>}</section>
    <div className="lab-toolbar"><button onClick={review}>Xem lại kiến thức</button><button onClick={practice}>Quay lại tình huống</button><button disabled={!progress.applied} onClick={protect}>Trở lại bước Bảo vệ</button></div>
  </section>;
}
