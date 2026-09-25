import { vi } from '../../../i18n/vi';
import { useState } from 'react';
import type { ExperimentResult } from '../../../types/experiment';
import { comparisonSnapshot, type ComparisonSnapshot } from './comparison';

type Session = ComparisonSnapshot['sessions'][number];
const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(2)}%`;
const metrics: [string, (s: Session) => string | number][] = [
  ['Giao thức', s => vi(s.protocol)], ['Hạt giống ngẫu nhiên gốc', s => s.seed], ['Số trạng thái', s => s.length],
  ['Số bit dự phòng bảo mật', s => s.margin],
  ['Cấu trúc / nguồn thực hiện / Eve', s => s.paths.join('\n')], ['Bit sau sàng lọc', s => s.sifted],
  ['Ngưỡng thu và phát hiện / xóa', s => s.reception.join('\n') || '—'],
  ['Tỷ lệ giữ lại', s => percent(s.siftRatio)], ['QBER', s => percent(s.qber)],
  ['Số bit tiết lộ khi sửa lỗi', s => s.leakage ?? '—'], ['Sửa trực tiếp dự phòng của Cascade', s => s.fallback === null ? '—' : s.fallback ? 'Có' : 'Không'],
  ['Ước lượng thông tin Eve biết', s => s.estimatedEve.toFixed(2)], ['Số bit khóa cuối', s => s.finalBits ?? '—'],
  ['QKD / khóa', s => `${s.qkdStatus ? vi(s.qkdStatus) : 'chưa hậu xử lý'} / ${vi(s.keyStatus)}`],
];

export default function ComparisonPanel({ result, learningDecision }: { result?: ExperimentResult; learningDecision?: string }) {
  const [slots, setSlots] = useState<{ A?: ComparisonSnapshot; B?: ComparisonSnapshot }>({});
  const current = result ? comparisonSnapshot(result) : undefined;
  if (current && learningDecision) current.learningDecision = learningDecision;
  const ids = [...new Set([...(slots.A?.sessions.map(s => s.id) ?? []), ...(slots.B?.sessions.map(s => s.id) ?? [])])];
  return <section className="lab-results" aria-label="So sánh lần chạy A/B">
    <h2>So sánh lần chạy A / lần chạy B</h2>
    <p>Giữ cùng mã định danh sơ đồ, hạt giống ngẫu nhiên gốc, phạm vi chạy và độ dài chuỗi khi so trường hợp không có Eve với Eve; đổi riêng cấu hình cần khảo sát. Mở lại mẫu tạo mã định danh mới. Phần cứng là quan sát bên ngoài, không tái lập bằng hạt giống ngẫu nhiên.</p>
    <div className="lab-toolbar">
      {(['A', 'B'] as const).map(slot => <button key={slot} disabled={!current} onClick={() => setSlots(previous => ({ ...previous, [slot]: current }))}>Giữ kết quả làm lần chạy {slot}</button>)}
      <button disabled={!slots.A && !slots.B} onClick={() => setSlots({})}>Xóa so sánh</button>
    </div>
    <p>Chỉ giữ thông tin cấu hình và các chỉ số trong bộ nhớ; không lưu nội dung truyền, chi tiết phép đo hoặc khóa. Kết quả chờ đo không thể ghim.</p>
    {!!ids.length && <div className="lab-table-scroll"><table aria-label="Bảng so sánh kết quả">
      <thead><tr><th>Chỉ số</th><th>Lần chạy A {slots.A?.id.slice(0, 8)}</th><th>Lần chạy B {slots.B?.id.slice(0, 8)}</th></tr></thead>
      <tbody>
        <tr><th>Phạm vi / trạng thái</th>{(['A', 'B'] as const).map(slot => <td key={slot}>{slots[slot] ? `${vi(slots[slot]!.scope)} / ${vi(slots[slot]!.state)}` : '—'}</td>)}</tr>
        {ids.map(id => {
          const a = slots.A?.sessions.find(s => s.id === id), b = slots.B?.sessions.find(s => s.id === id);
          return metrics.map(([label, value], index) => <tr key={`${id}:${label}`}><th>{index === 0 ? `${(a ?? b)!.label} · ${id.slice(0, 8)} / ` : ''}{label}</th>{[a, b].map((s, i) => <td key={i} style={{whiteSpace:'pre-line'}}>{s ? value(s) : '— (phiên không có trong lần chạy này)'}</td>)}</tr>);
        })}
        <tr><th>Trạng thái dữ liệu</th>{(['A', 'B'] as const).map(slot => <td key={slot}>{slots[slot]?.data.map(d => <p key={d.id}>{d.route} · {d.protection === 'none' ? 'Không mã hóa' : vi(d.protection)} · {vi(d.application)} / {vi(d.transmission)} · AES {d.aesReady ? 'sẵn sàng' : 'chưa sẵn sàng'} · toàn vẹn {d.integrityVerified ? 'đạt' : 'chưa xác minh'}</p>) ?? '—'}</td>)}</tr>
        {(slots.A?.learningDecision || slots.B?.learningDecision) && <tr><th>Kết luận bài học tại thời điểm chạy</th>{(['A', 'B'] as const).map(slot => <td key={slot}>{slots[slot]?.learningDecision ?? '—'}</td>)}</tr>}
      </tbody>
    </table></div>}
  </section>;
}
