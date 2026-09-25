import type { LearningExperienceId } from '../../../types/learning';
import { experiences, futureExperiences, levelLabels } from './scenarios';

export default function LearningHome({ start, started }: { start: (id: LearningExperienceId) => void; started: LearningExperienceId[] }) {
  return <section className="visual-lab learning-home">
    <div className="learning-hero"><span className="learning-kicker">PHÒNG THÍ NGHIỆM TÀI CHÍNH SỐ</span>
      <h2>Hiểu nghiệp vụ.<br /><span>Bảo vệ dữ liệu tài chính.</span></h2>
      <p>Thực hành đối chiếu công nợ và kiểm soát lệnh thanh toán, rồi quan sát cách AI-QKD và AES bảo vệ dữ liệu của chính bài tập đó.</p>
      <div className="learning-journey"><span>01 · Học</span><span>02 · Thực hành</span><span>03 · Bảo vệ</span><span>04 · Tổng kết</span></div>
    </div>
    <h3 className="learning-section-title">Chọn lộ trình học</h3>
    <div className="learning-cards">{experiences.map((e, index) => <article key={e.id} className="learning-card">
      <div className="learning-card-top"><span className="learning-number">0{index + 1}</span><span className="lab-tag">{levelLabels[e.level]}</span></div>
      <h3>{e.title}</h3><p>{e.description}</p><ul>{e.learningObjectives.map(o => <li key={o}>{o}</li>)}</ul>
      <button onClick={() => start(e.id)}>{started.includes(e.id) ? 'Tiếp tục' : 'Bắt đầu'} · {e.title} <span aria-hidden>→</span></button>
    </article>)}</div>
    <section className="learning-future"><h3>Sẽ phát triển sau</h3><p>Hai bài tập tài chính bên trên là phạm vi đang hoạt động.</p>
      <div>{futureExperiences.map(title => <button disabled key={title}>{title} · Sắp có</button>)}</div>
    </section>
    <p className="learning-boundary">Dữ liệu và vai trò đều giả lập. Đây là môi trường học tập; không gửi lệnh đến ngân hàng và không chuyển tiền thật. Tiến độ bài tập chỉ giữ trong bộ nhớ tab.</p>
  </section>;
}
