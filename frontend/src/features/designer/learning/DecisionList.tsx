import type { DecisionPoint, LearningProgress } from '../../../types/learning';

export default function DecisionList({ points, progress, enabled = true, answer, retry }: {
  points: DecisionPoint[]; progress: LearningProgress; enabled?: boolean;
  answer: (id: string, optionId: string) => void; retry: (id: string) => void;
}) {
  return <div className="learning-decisions">{points.map((point, index) => {
    const response = progress.answers[point.id];
    const selected = point.options.find(o => o.id === response?.selectedId);
    const locked = !enabled || points.slice(0, index).some(q => !progress.answers[q.id]?.solved);
    return <section className={`decision-card ${response?.solved ? 'is-solved' : ''}`} key={point.id} aria-label={point.concept}>
      <div className="decision-heading"><span className="learning-kicker">ĐIỂM QUYẾT ĐỊNH {index + 1}</span><span>{response?.solved ? '✓ Đã xử lý đúng' : locked ? 'Chưa mở' : 'Đến lượt bạn'}</span></div>
      <h3>{point.concept}</h3><p className="decision-situation">{point.situation}</p>
      <fieldset disabled={locked || !!response?.selectedId || response?.solved}>
        <legend>{point.question}</legend><div className="decision-options">{point.options.map(option => <button key={option.id}
          className={selected?.id === option.id ? response?.solved ? 'chosen-correct' : 'chosen-wrong' : ''}
          onClick={() => answer(point.id, option.id)}><span className="decision-letter">{option.id}</span><span>{option.label}</span></button>)}</div>
      </fieldset>
      {locked && <p className="decision-hint">{enabled ? 'Xử lý đúng điểm quyết định phía trên để tiếp tục.' : 'Hoàn tất bước trước để mở điểm quyết định này.'}</p>}
      {selected && <div className={`decision-feedback ${response?.solved ? 'is-correct' : 'is-wrong'}`} role="status">
        <strong>{response?.solved ? '✓ Đúng.' : 'Chưa đúng.'}</strong><p>{selected.explanation}</p>
        {!response?.solved && <button onClick={() => retry(point.id)}>Suy nghĩ và thử lại</button>}
      </div>}
    </section>;
  })}</div>;
}
