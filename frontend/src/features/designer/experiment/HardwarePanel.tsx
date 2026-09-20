import { diagnosticText } from '../../../i18n/vi';
import { useEffect, useRef, useState } from 'react';
import { cancelExperiment, getExperiment, submitMeasurement } from '../../../api/designer';
import type { ExperimentResult } from '../../../types/experiment';

export default function HardwarePanel({ result, update }: { result: ExperimentResult; update: (result: ExperimentResult) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<{ taskId: string; detector: 'D0' | 'D1' }>();
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const task = result.currentTask;
  const name = (id: string) => result.graphSnapshot.nodes.find(n => n.id === id)?.name ?? id;
  const path = result.graphSnapshot.quantumPaths.find(p => p.id === task?.pathId);
  const act = async (kind: 'submit' | 'refresh' | 'cancel', measurement = retry) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 60000);
    try {
      if (kind === 'submit' && measurement) {
        setRetry(measurement);
        const ack = await submitMeasurement(result.id, measurement.taskId, measurement.detector, abort.signal);
        const latest = ack.result ?? await getExperiment(result.id, abort.signal);
        setRetry(undefined); update(latest);
      } else {
        const latest = kind === 'cancel' ? await cancelExperiment(result.id, abort.signal) : await getExperiment(result.id, abort.signal);
        if (kind === 'cancel') setRetry(undefined);
        update(latest);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Không nhận được phản hồi phép đo.';
      setError(message);
      if (message === 'EXPERIMENT_NOT_FOUND_OR_EXPIRED') {
        setRetry(undefined);
        update({ ...result, state: 'failed', currentTask: null, diagnostic: message });
      }
    } finally { clearTimeout(timer); inFlight.current = false; setBusy(false); }
  };
  return <section className="lab-session-result" aria-label="Thu nhận thủ công bằng Thorlabs">
    <h3>Thorlabs · Mô hình tương tự phân cực vật lý</h3>
    <p>Đã ghi {result.progress?.completed ?? 0}/{result.progress?.total ?? 0} phép đo. Nhập đầu dò quan sát thực tế; đây không phải câu hỏi chọn đáp án đúng.</p>
    {task && <>
      <p><strong>{path ? `${name(path.source)} → ${name(path.target)}` : name(task.roleNodeId)}</strong> · trạng thái #{task.stateIndex + 1} · nguồn phần cứng</p>
      <p>Chuẩn bị bit {task.preparedBit}, cơ sở đo {task.preparedBasis} · góc phân cực {task.polarizationDeg}°. Cơ sở đo bên nhận {task.measurementBasis} · góc bộ phân tích {task.analyzerDeg}°.</p>
      <p className="lab-muted">Quy ước phòng thí nghiệm: Z0=0°, Z1=90°, X0=45°, X1=135°; D0→0, D1→1. Căn chỉnh bộ thiết bị theo quy ước này. Bên phân phối khóa tin cậy đo xong lượt A rồi mới chuyển sang B.</p>
      <div className="lab-toolbar">
        {(['D0', 'D1'] as const).map(detector => <button key={detector} disabled={busy || !!retry} onClick={() => act('submit', { taskId: task.taskId, detector })}>Ghi {detector}</button>)}
      </div>
    </>}
    {retry && <p>Phép đo đang chờ xác nhận: {retry.detector}. Gửi lại dùng nguyên mã phép đo, không tạo phép đo mới.</p>}
    <div className="lab-toolbar">
      {retry && <button disabled={busy} onClick={() => act('submit')}>Gửi lại phép đo</button>}
      <button disabled={busy} onClick={() => act('refresh')}>Làm mới trạng thái</button>
      {result.state === 'waiting_for_hardware' && <button disabled={busy} onClick={() => act('cancel')}>Hủy phiên đo</button>}
    </div>
    {error && <p role="alert">{diagnosticText(error)}</p>}
    <p className="lab-muted">Phiên ở bộ nhớ máy chủ tối đa 30 phút; khởi động lại máy chủ sẽ mất phiên. Chỉnh sửa sơ đồ không thay đổi cấu hình của phiên đang đo.</p>
  </section>;
}
