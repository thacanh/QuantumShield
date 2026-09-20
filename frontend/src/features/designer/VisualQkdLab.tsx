import { diagnosticText } from '../../i18n/vi';
import { useRef, useState } from 'react';
import type { Connection, NodeChange } from '@xyflow/react';
import type { Selection, SystemGraph, SystemNodeType } from '../../types/system';
import SystemCanvas from './system/SystemCanvas';
import SystemInspector from './system/SystemInspector';
import DesignValidation from './system/DesignValidation';
import ProtocolWorkspace from './protocol/ProtocolWorkspace';
import SystemPalette, { type LinkDraft } from './system/SystemPalette';
import type { ActorFlowNode } from './system/ActorNode';
import { systemTemplate, type TemplateKind, addDataLink, addSession, attachEve, eveConnectionPaths, designWarnings, directTemplate, emptyGraph, makeId, nodeLabels, removeEntity } from './system/graph';
import { exportDesign, importDesign, MAX_IMPORT_BYTES, STORAGE_KEY } from './system/persistence';
import '@xyflow/react/dist/style.css';
import './designer.css';

function loadInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return { graph: saved ? importDesign(saved) : directTemplate(), notice: saved ? 'Đã khôi phục sơ đồ đã lưu.' : 'Bắt đầu từ mẫu QKD trực tiếp. Bạn có thể chỉnh hoặc tạo sơ đồ trống.', dirty: !saved };
  } catch (error) {
    return { graph: emptyGraph(), notice: `Không thể khôi phục bản lưu: ${error instanceof Error ? diagnosticText(error.message) : 'Lỗi bộ nhớ lưu trữ'}. Bản lưu cũ chưa bị ghi đè.`, dirty: true };
  }
}

export default function VisualQkdLab({ active = true }: { active?: boolean }) {
  const [initial] = useState(loadInitial);
  const [editor, setEditor] = useState({ graph: initial.graph, history: [] as SystemGraph[], dirty: initial.dirty });
  const [selection, setSelection] = useState<Selection>(null);
  const [eveChoice, setEveChoice] = useState<{ eveId: string; pathIds: string[] } | null>(null);
  const [template, setTemplate] = useState<TemplateKind>('direct');
  const [view, setView] = useState<'system' | 'protocol'>('system');
  const [protocolSessionId, setProtocolSessionId] = useState('');
  const openProtocol = (id: string) => { setProtocolSessionId(id); setView('protocol'); };
  const [notice, setNotice] = useState(initial.notice);
  const [draft, setDraft] = useState<LinkDraft & { revision: number }>({ mode: 'direct_bb84', source: '', target: '', distributor: '', revision: 0 });
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [exportText, setExportText] = useState('');
  const beforeDrag = useRef<SystemGraph | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { graph } = editor;
  const warnings = designWarnings(graph);
  const commit = (next: SystemGraph) => {
    setEveChoice(null);
    setEditor(previous => ({ graph: next, history: [...previous.history, previous.graph].slice(-30), dirty: true }));
    setExportText('');
  };
  const attempt = (action: () => void) => { try { action(); } catch (error) { setNotice(error instanceof Error ? diagnosticText(error.message) : 'Thao tác chưa hoàn tất.'); } };
  const addNode = (type: SystemNodeType, position = { x: 80 + graph.nodes.length % 3 * 230, y: 250 + Math.floor(graph.nodes.length / 3) * 150 }) => {
    if (graph.nodes.length >= 100) { setNotice('Sơ đồ hỗ trợ tối đa 100 thực thể.'); return; }
    const id = makeId();
    commit({ ...graph, nodes: [...graph.nodes, { id, type, name: type === 'eavesdropper' ? 'Eve' : `${nodeLabels[type]} ${graph.nodes.filter(n => n.type === type).length + 1}`, position, config: {} }] });
    setSelection({ kind: 'node', id });
  };
  const addLink = (link: LinkDraft) => attempt(() => {
    if (graph.qkdSessions.length >= 100 || graph.edges.length >= 200) throw new Error('Sơ đồ đã đạt giới hạn số kết nối.');
    const next = link.mode === 'data' ? addDataLink(graph, link.source, link.target) : addSession(graph, link.mode, link.source, link.target, link.distributor);
    commit(next);
    setSelection(link.mode === 'data' ? { kind: 'data', id: next.edges.at(-1)!.id } : { kind: 'path', id: next.quantumPaths.at(-1)!.id });
    setNotice(link.mode === 'data' ? 'Đã thêm đường dữ liệu.' : 'Đã tạo phiên QKD. Chưa chạy thí nghiệm.');
  });
  const connectEve = (pathId: string, eveId: string) => attempt(() => {
    const next = attachEve(graph, pathId, eveId);
    if (next !== graph) commit(next);
    setEveChoice(null);
    setSelection({ kind: 'path', id: pathId });
    const path = next.quantumPaths.find(p => p.id === pathId)!;
    setNotice(`Đã gắn ${name(eveId)} nghe lén đường đến ${name(path.target)}: ${name(path.source)} → ${name(path.target)}; khoảng lệch ${path.eveOffsetMeters ?? 100} m so với đầu thu.`);
  });
  const connect = (connection: Connection) => attempt(() => {
    const { source, target, sourceHandle, targetHandle } = connection;
    const dataConnection = sourceHandle === 'data-out' && targetHandle === 'data-in';
    const qkdConnection = sourceHandle === 'qkd-out' && targetHandle === 'qkd-in';
    if (!dataConnection && !qkdConnection) { setNotice('Không nối cổng QKD với cổng dữ liệu.'); return; }
    setEveChoice(null);
    const eve = qkdConnection ? eveConnectionPaths(graph, source, target) : null;
    if (eve) {
      setSelection({ kind: 'node', id: eve.eveId });
      if (!eve.paths.length) {
        setNotice('Thực thể này chưa là đầu thu của đường QKD nào. Chỉ nối Eve với đầu thu: ví dụ Alice → Bob thì chọn Bob.');
      } else if (eve.paths.length === 1) {
        connectEve(eve.paths[0].id, eve.eveId);
      } else {
        setEveChoice({ eveId: eve.eveId, pathIds: eve.paths.map(p => p.id) });
        setNotice('Có nhiều đường truyền QKD theo hướng này. Chọn nhánh cần gắn Eve ngay phía trên vùng vẽ.');
      }
      return;
    }
    const sender = graph.nodes.find(n => n.id === source);
    if (qkdConnection && sender?.type === 'key_distributor') {
      setDraft({ mode: 'trusted_distributor', source: target, target: '', distributor: source, revision: draft.revision + 1 });
      setNotice('Chọn Bên tham gia B trong biểu mẫu bên trái rồi tạo phiên hai đường truyền. Chưa tạo đường truyền đơn lẻ.');
      return;
    }
    addLink({ mode: dataConnection ? 'data' : 'direct_bb84', source, target, distributor: '' });
  });
  const move = (changes: NodeChange<ActorFlowNode>[]) => {
    const positions = changes.filter(c => c.type === 'position' && c.position);
    if (!positions.length) return;
    setEditor(previous => ({ ...previous, dirty: true, graph: { ...previous.graph, nodes: previous.graph.nodes.map(n => {
      const change = positions.find(c => c.type === 'position' && c.id === n.id);
      return change?.type === 'position' && change.position ? { ...n, position: change.position } : n;
    }) } }));
    setExportText('');
  };
  const replace = (next: SystemGraph) => {
    commit(next);
    setSelection(null);
    setDraft(previous => ({ mode: 'direct_bb84', source: '', target: '', distributor: '', revision: previous.revision + 1 }));
  };
  const importJson = (value: string) => attempt(() => { const next = importDesign(value); replace(next); setShowImport(false); setImportText(''); setNotice('Đã nhập sơ đồ. Có thể Hoàn tác; chưa ghi đè bản lưu.'); });
  const name = (id: string) => graph.nodes.find(n => n.id === id)?.name ?? id;
  return (
    <main className="visual-lab">
      <header className="lab-header">
        <div><h2>Thiết kế hệ thống QKD</h2><p>Thiết kế hệ thống · cấu hình đường truyền · khám phá QKD</p></div>
        <span className="lab-status">{view === 'system' ? 'SƠ ĐỒ HỆ THỐNG' : 'QUY TRÌNH QKD'} · PHÒNG THÍ NGHIỆM QKD</span>
      </header>
      <div className="lab-toolbar">
        <label>Tên sơ đồ<input aria-label="Tên sơ đồ" maxLength={200} value={graph.name} onChange={e => commit({ ...graph, name: e.target.value })} /></label>
        <button onClick={() => { replace(emptyGraph()); setNotice('Đã tạo sơ đồ trống. Có thể Hoàn tác.'); }}>Sơ đồ mới</button>
        <label>Mẫu hệ thống<select aria-label="Mẫu hệ thống" value={template} onChange={e => setTemplate(e.target.value as TemplateKind)}><option value="direct">QKD trực tiếp</option><option value="trusted">Phân phối khóa tin cậy</option><option value="hybrid">Kết hợp mô phỏng và phần cứng</option><option value="eve">Eve nghe lén</option></select></label>
        <button onClick={() => { replace(systemTemplate(template)); setNotice('Đã mở mẫu hệ thống với mã định danh mới. Có thể Hoàn tác.'); }}>Mở mẫu</button>
        <button disabled={!editor.history.length} onClick={() => { setEditor(previous => ({ graph: previous.history.at(-1)!, history: previous.history.slice(0, -1), dirty: true })); setEveChoice(null); setSelection(null); setExportText(''); setNotice('Đã hoàn tác.'); }}>Hoàn tác</button>
        <button className="primary" onClick={() => attempt(() => { localStorage.setItem(STORAGE_KEY, exportDesign(graph)); setEditor(previous => ({ ...previous, dirty: false })); setNotice('Đã lưu thiết kế trong trình duyệt. Không lưu nội dung truyền hoặc dữ liệu khóa bí mật.'); })}>Lưu sơ đồ</button>
        <button onClick={() => attempt(() => { const saved = localStorage.getItem(STORAGE_KEY); if (!saved) throw new Error('Chưa có sơ đồ đã lưu.'); replace(importDesign(saved)); setEditor(previous => ({ ...previous, dirty: false })); setNotice('Đã tải bản lưu. Có thể Hoàn tác.'); })}>Tải bản lưu</button>
        <button onClick={() => attempt(() => { setExportText(exportDesign(graph)); setShowImport(false); })}>Xuất JSON</button>
        <button onClick={() => { setShowImport(!showImport); setExportText(''); }}>Nhập JSON</button>
        <span className="lab-save-state">{editor.dirty ? 'Chưa lưu' : 'Đã lưu'}</span>
      </div>
      <p className="lab-message" role="status">{notice}</p>
      <div className="lab-toolbar" aria-label="Chế độ Visual Lab">
        <button aria-pressed={view === 'system'} onClick={() => setView('system')}>Sơ đồ hệ thống</button>
        <button aria-pressed={view === 'protocol'} onClick={() => setView('protocol')}>Quy trình QKD</button>
      </div>
      {showImport && <section className="lab-transfer">
        <h2>Nhập thiết kế</h2><p>JSON cấu trúc quantumshield-visual-lab v1 · tối đa 2 MB. Tệp sai sẽ không thay sơ đồ hiện tại.</p>
        <textarea aria-label="JSON cần nhập" value={importText} onChange={e => setImportText(e.target.value)} placeholder="Dán JSON thiết kế tại đây" />
        <div><button onClick={() => importJson(importText)}>Kiểm tra và nhập</button><button onClick={() => fileInput.current?.click()}>Chọn tệp JSON</button></div>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          if (file.size > MAX_IMPORT_BYTES) { setNotice('Tệp thiết kế vượt quá 2 MB.'); return; }
          try { importJson(await file.text()); } catch { setNotice('Không đọc được tệp thiết kế.'); }
        }} />
      </section>}
      {exportText && <section className="lab-transfer">
        <h2>Xuất thiết kế</h2><p>Chỉ cấu trúc và cấu hình. Không chứa nội dung truyền, kết quả hay khóa.</p>
        <textarea readOnly aria-label="JSON đã loại dữ liệu nhạy cảm" value={exportText} />
        <button onClick={() => { const url = URL.createObjectURL(new Blob([exportText], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'quantumshield-design.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Tải tệp JSON</button>
        <button onClick={() => setExportText('')}>Đóng bản xuất</button>
      </section>}
      <div hidden={view !== 'system'}><div className="lab-layout">
        <SystemPalette key={draft.revision} graph={graph} initialDraft={draft} addNode={addNode} addLink={addLink} />
        <section className="lab-center">
          {eveChoice && <section className="lab-panel" aria-label="Chọn nhánh cho Eve">
            <h3>{name(eveChoice.eveId)} nghe lén đường QKD nào tại đầu thu này?</h3>
            {graph.quantumPaths.filter(p => eveChoice.pathIds.includes(p.id)).map(p => <button key={p.id}
              disabled={p.provider !== 'simulation' || (!!p.viaEveId && p.viaEveId !== eveChoice.eveId)}
              onClick={() => connectEve(p.id, eveChoice.eveId)}>
              Nghe lén đường đến {name(p.target)} · {name(p.source)} → {name(p.target)} · {p.id.slice(0, 8)}{p.provider !== 'simulation' ? ' · Phần cứng không hỗ trợ Eve' : p.viaEveId ? ` · đã có ${name(p.viaEveId)}` : ''}
            </button>)}
            <button onClick={() => setEveChoice(null)}>Hủy chọn nhánh</button>
          </section>}
          <div className="lab-canvas-heading"><h2>Vùng vẽ hệ thống</h2><span>━━→ QKD &nbsp; ┄ Eve–đầu thu (rE) &nbsp; ┄→ Dữ liệu</span></div>
          {active && view === 'system' && <SystemCanvas key={graph.id} graph={graph} selection={selection} select={setSelection} move={move} connect={connect} addNode={addNode} openProtocol={openProtocol}
            onDragStart={() => { beforeDrag.current = graph; }} onDragStop={() => {
              const previous = beforeDrag.current; beforeDrag.current = null;
              if (previous) setEditor(current => ({ ...current, history: [...current.history, previous].slice(-30) }));
            }} />}
          <div className="lab-entity-list" aria-label="Thực thể và đường truyền">
            {graph.nodes.map(n => <button key={n.id} onClick={() => setSelection({ kind: 'node', id: n.id })}>{nodeLabels[n.type]} · {n.name}</button>)}
            {graph.quantumPaths.map((p, i) => <button key={p.id} onClick={() => setSelection({ kind: 'path', id: p.id })}>QKD {i + 1} · {name(p.source)} → {name(p.target)}</button>)}
            {graph.edges.map((e, i) => <button key={e.id} onClick={() => setSelection({ kind: 'data', id: e.id })}>Dữ liệu {i + 1} · {name(e.source)} → {name(e.target)}</button>)}
          </div>
        </section>
        <SystemInspector graph={graph} selection={selection} change={commit} attachEve={connectEve} openProtocol={openProtocol} remove={() => { commit(removeEntity(graph, selection)); setSelection(null); setNotice('Đã xóa thực thể/kết nối được chọn. Có thể Hoàn tác.'); }} />
      </div>
      <section className="lab-results">
        <h2>Kiểm tra thiết kế</h2>
        <DesignValidation graph={graph} select={setSelection} />
        <p>Kiểm tra sơ bộ nguồn khóa tại trình duyệt:</p>
        {warnings.length ? <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : <p className="lab-ok">Chưa thấy thiếu hoặc mơ hồ nguồn khóa trong thiết kế hiện tại.</p>}
        <p>Mở Quy trình QKD để chạy QKD lý tưởng/FSO hoặc Thorlabs đo thủ công và truyền dữ liệu bằng khóa của lần chạy đó.</p>
      </section>
      </div>
      <div hidden={view !== 'protocol'}><ProtocolWorkspace graph={graph} sessionId={protocolSessionId} choose={setProtocolSessionId} change={commit} active={active && view === 'protocol'} /></div>
    </main>
  );
}
