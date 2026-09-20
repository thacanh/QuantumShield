import { useState } from 'react';
import type { SystemGraph, SystemNodeType } from '../../../types/system';
import { nodeLabels } from './graph';
import { Field } from './SystemInspector';

export interface LinkDraft { mode: 'direct_bb84' | 'trusted_distributor' | 'data'; source: string; target: string; distributor: string }
export default function SystemPalette({ graph, initialDraft, addNode, addLink }: {
  graph: SystemGraph; initialDraft: LinkDraft; addNode: (kind: SystemNodeType) => void; addLink: (draft: LinkDraft) => void;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const participants = graph.nodes.filter(n => n.type === 'participant');
  const distributors = graph.nodes.filter(n => n.type === 'key_distributor');
  const source = participants.some(n => n.id === draft.source) ? draft.source : participants[0]?.id ?? '';
  const target = participants.some(n => n.id === draft.target) ? draft.target : participants.find(n => n.id !== source)?.id ?? '';
  const distributor = distributors.some(n => n.id === draft.distributor) ? draft.distributor : distributors[0]?.id ?? '';
  return <aside className="lab-palette lab-panel">
    <h2>Thực thể</h2>
    <p className="lab-muted">Bấm để thêm hoặc kéo vào vùng vẽ.</p>
    <div className="lab-node-buttons">
      {(Object.keys(nodeLabels) as SystemNodeType[]).map(type => <button key={type} type="button" draggable
        className={`lab-palette-node ${type}`} onClick={() => addNode(type)}
        onDragStart={e => { e.dataTransfer.setData('application/quantumshield-node', type); e.dataTransfer.effectAllowed = 'move'; }}>
        <span className="lab-dot" />+ {nodeLabels[type]}
      </button>)}
    </div>
    <h2>Tạo kết nối</h2>
    <p className="lab-muted">QKD: kéo cổng tròn hai bên. Dữ liệu: nối các cổng vuông ở đáy thực thể (ra bên phải → vào bên trái). Hoặc dùng biểu mẫu bên dưới.</p>
    <p className="lab-muted">Alice và Bob là hai bên tham gia. Charlie phân phối khóa cho cả hai trong mô hình tin cậy. Eve nghe lén đường đến Alice hoặc Bob.</p>
    <p className="lab-muted">Tạo đường QKD trước, rồi nối Eve với đầu thu của đường đó. Nếu đầu thu có nhiều đường QKD, chọn đúng đường muốn nghe lén. Nét đứt biểu diễn khoảng lệch Eve so với đầu thu.</p>
    <form onSubmit={e => { e.preventDefault(); addLink({ ...draft, source, target, distributor }); }}>
      <Field label="Loại kết nối"><select value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value as LinkDraft['mode'] })}>
        <option value="direct_bb84">QKD · BB84 trực tiếp</option><option value="trusted_distributor">QKD · Phân phối khóa tin cậy</option><option value="data">Dữ liệu →</option>
      </select></Field>
      {draft.mode === 'trusted_distributor' && <Field label="Bên phân phối khóa"><select value={distributor} onChange={e => setDraft({ ...draft, distributor: e.target.value })}>
        <option value="">Chọn bên phân phối khóa</option>{distributors.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select></Field>}
      <Field label={draft.mode === 'trusted_distributor' ? 'Bên tham gia A' : 'Từ bên tham gia'}><select value={source} onChange={e => setDraft({ ...draft, source: e.target.value })}>
        <option value="">Chọn bên tham gia</option>{participants.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select></Field>
      <Field label={draft.mode === 'trusted_distributor' ? 'Bên tham gia B' : 'Đến bên tham gia'}><select value={target} onChange={e => setDraft({ ...draft, target: e.target.value })}>
        <option value="">Chọn bên tham gia</option>{participants.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select></Field>
      <button className="primary" type="submit">{draft.mode === 'data' ? 'Thêm đường dữ liệu' : 'Tạo phiên QKD'}</button>
    </form>
    <h2>Danh sách</h2>
    <p className="lab-muted">{graph.nodes.length} thực thể · {graph.qkdSessions.length} phiên · {graph.edges.length} đường dữ liệu</p>
  </aside>;
}
