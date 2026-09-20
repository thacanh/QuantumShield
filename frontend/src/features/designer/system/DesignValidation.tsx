import { diagnosticText, vi } from '../../../i18n/vi';
import { useEffect, useRef, useState } from 'react';
import { getDesignerCatalog, validateDesign, type DesignerCatalog, type ValidationIssue, type ValidationResult } from '../../../api/designer';
import type { Selection, SystemGraph } from '../../../types/system';

interface CheckedDesign { graph: SystemGraph; report?: ValidationResult; catalog?: DesignerCatalog; error?: string }

export default function DesignValidation({ graph, select }: { graph: SystemGraph; select: (value: Selection) => void }) {
  const [checked, setChecked] = useState<CheckedDesign>();
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const check = async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPending(true);
    const timeout = setTimeout(() => current.abort(), 20000);
    try {
      const [catalog, report] = await Promise.all([getDesignerCatalog(current.signal), validateDesign(graph, current.signal)]);
      if (controller.current === current) setChecked({ graph, catalog, report });
    } catch {
      if (controller.current === current) setChecked({ graph, error: 'Không nhận được xác thực từ máy chủ. Kiểm tra kết nối/API URL rồi thử lại.' });
    } finally {
      clearTimeout(timeout);
      if (controller.current === current) setPending(false);
    }
  };
  const focusIssue = (issue: ValidationIssue): Selection => {
    const id = issue.entityId;
    if (!id) return null;
    if (graph.nodes.some(n => n.id === id)) return { kind: 'node', id };
    if (graph.edges.some(e => e.id === id)) return { kind: 'data', id };
    const path = graph.quantumPaths.find(p => p.id === id || p.sessionId === id);
    return path ? { kind: 'path', id: path.id } : null;
  };
  const current = checked?.graph === graph ? checked : undefined;
  return <div className="lab-server-validation">
    <button className="primary" disabled={pending} onClick={check}>{pending ? 'Đang kiểm tra…' : 'Kiểm tra với máy chủ'}</button>
    <div role="status">
      {checked && !current && <p>Sơ đồ đã thay đổi. Kiểm tra lại để có kết quả mới.</p>}
      {current?.error && <p>{current.error}</p>}
      {current?.report && <>
        <p className={current.report.valid ? 'lab-ok' : ''}>{current.report.valid ? 'Cấu trúc và cấu hình hợp lệ theo máy chủ.' : 'Thiết kế có lỗi cần sửa.'} Chưa chạy QKD hoặc kiểm tra khóa AES.</p>
        {[...current.report.errors, ...current.report.warnings].map((issue, i) => {
          const target = focusIssue(issue);
          return <p key={i}>{diagnosticText(issue.code)} {issue.path.length > 0 && <code>{issue.path.join('.')}</code>} {target && <button onClick={() => select(target)}>Chọn thực thể</button>}</p>;
        })}
      </>}
    </div>
    {current?.catalog && <p className="lab-muted">Danh mục máy chủ: {current.catalog.protocols.map(vi).join(' · ')} · {current.catalog.providers.map(p => vi(p.id)).join(' / ')}.</p>}
  </div>;
}
