import type { SystemGraph } from '../../../types/system';

export interface DataDraft { enabled: boolean; plaintext: string }
export default function DataInputPanel({ graph, drafts, change }: {
  graph: SystemGraph; drafts: Record<string, DataDraft>; change: (id: string, draft: DataDraft) => void;
}) {
  const name = (id: string) => graph.nodes.find(n => n.id === id)?.name ?? id;
  return <details className="lab-data-input"><summary>Nội dung truyền dữ liệu · {graph.edges.length} đường truyền</summary>
    <p>Nội dung chỉ ở bộ nhớ lần chạy, không lưu trong sơ đồ. Văn bản/UTF-8 tối đa 500 KB mỗi đường truyền. Khóa mô phỏng dùng hạt giống ngẫu nhiên công khai, chỉ dùng dữ liệu minh họa.</p>
    {graph.edges.map((edge, index) => {
      const draft = drafts[edge.id] ?? { enabled: false, plaintext: '' };
      return <div className="lab-session-result" key={edge.id}>
        <label><input type="checkbox" aria-label={`Truyền Dữ liệu ${index + 1}`} checked={draft.enabled} onChange={e => change(edge.id, { ...draft, enabled: e.target.checked })} /> Dữ liệu {index + 1}: {name(edge.source)} → {name(edge.target)} · {edge.config.protection === 'none' ? 'Bản rõ (không mã hóa)' : 'AES-256-GCM'}</label>
        {draft.enabled && <>
          <textarea aria-label={`Nội dung truyền Dữ liệu ${index + 1}`} value={draft.plaintext} onChange={e => change(edge.id, { ...draft, plaintext: e.target.value })} placeholder="Nhập nội dung minh họa" />
          <label>Đọc tệp UTF-8<input type="file" aria-label={`Tệp UTF-8 Dữ liệu ${index + 1}`} accept=".txt,.csv,.json,.md,text/*" onChange={async event => {
            const file = event.target.files?.[0]; event.target.value = '';
            if (!file) return;
            if (file.size > 500000) { event.target.setCustomValidity('Tệp vượt 500 KB.'); event.target.reportValidity(); return; }
            const input = event.target;
            try {
              const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
              change(edge.id, { ...draft, plaintext: text }); input.setCustomValidity('');
            } catch { input.setCustomValidity('Tệp không phải UTF-8 hợp lệ.'); input.reportValidity(); }
          }} /></label>
        </>}
      </div>;
    })}
  </details>;
}
