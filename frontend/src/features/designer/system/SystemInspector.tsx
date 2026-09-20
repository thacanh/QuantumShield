import { cloneElement, useId, type ReactElement } from 'react';
import type { QuantumPath, Selection, SimulationProviderConfig, SystemGraph } from '../../../types/system';
import { compatibleSessions, nodeLabels } from './graph';
import { vi } from '../../../i18n/vi';

export function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div className="lab-field"><label htmlFor={id}>{label}</label>{cloneElement(children, { id })}</div>;
}
export function NumberField({ label, value, min = 0, max = 65536, step = 1, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void;
}) {
  return <Field label={label}><input type="number" value={value} min={min} max={max} step={step}
    onChange={e => { if (e.target.value !== '') onChange(Math.max(min, Math.min(max, step === 1 ? Math.trunc(Number(e.target.value)) : Number(e.target.value)))); }} /></Field>;
}

interface Props { graph: SystemGraph; selection: Selection; change: (graph: SystemGraph) => void; attachEve: (pathId: string, eveId: string) => void; remove: () => void; openProtocol: (id: string) => void }

export default function SystemInspector({ graph, selection, change, attachEve, remove, openProtocol }: Props) {
  const name = (id: string) => graph.nodes.find(n => n.id === id)?.name ?? id;
  const node = selection?.kind === 'node' ? graph.nodes.find(n => n.id === selection.id) : undefined;
  const path = selection?.kind === 'path' ? graph.quantumPaths.find(p => p.id === selection.id) : undefined;
  const edge = selection?.kind === 'data' ? graph.edges.find(e => e.id === selection.id) : undefined;
  const session = path && graph.qkdSessions.find(s => s.id === path.sessionId);
  const updatePath = (patch: Partial<QuantumPath>) => path && change({ ...graph, quantumPaths: graph.quantumPaths.map(p => p.id === path.id ? { ...p, ...patch } : p) });
  const config = path?.providerConfig as SimulationProviderConfig | undefined;
  const updateConfig = (patch: Partial<SimulationProviderConfig>) => updatePath({ providerConfig: { ...config, model: config?.model ?? 'ideal', ...patch } });
  return (
    <aside className="lab-inspector lab-panel">
      <h2>Cấu hình</h2>
      {!node && !path && !edge && <p className="lab-muted">Chọn thực thể hoặc đường nối để chỉnh cấu hình. Nét đứt Eve–đầu thu biểu diễn khoảng lệch, không phải đường chuyển tiếp QKD.</p>}
      {node && <>
        <p className="lab-tag">{nodeLabels[node.type]}</p>
        <Field label="Tên thực thể"><input maxLength={200} value={node.name} onChange={e => change({ ...graph, nodes: graph.nodes.map(n => n.id === node.id ? { ...n, name: e.target.value } : n) })} /></Field>
        <p className="lab-muted" >Mã định danh ổn định khi đổi tên. Kéo thực thể trên vùng vẽ để đổi vị trí.</p>
        {node.type === 'participant' && <p className="lab-note">Bên tham gia trao đổi khóa và dữ liệu, như Alice hoặc Bob.</p>}
        {node.type === 'key_distributor' && <p className="lab-note">Bên phân phối khóa tin cậy, như Charlie, phát trạng thái lượng tử cho cả Alice và Bob. Eve nghe lén trên nhánh đến từng bên nhận.</p>}
        {node.type === 'eavesdropper' && <>
          <p className="lab-note">Nối Eve với đầu thu của đường QKD có sẵn, hoặc chọn đường bên dưới. Eve là máy thu quang gần vùng chùm tia ở đầu thu. Mỗi đường có một dấu Eve riêng đi theo đầu thu; vị trí vẽ chỉ minh họa, khoảng lệch thực đặt bằng mét.</p>
          <Field label="Chọn đường truyền bị nghe lén"><select value="" onChange={e => { if (e.target.value) attachEve(e.target.value, node.id); }}>
            <option value="">Chọn nhánh đến bên bị nghe lén</option>
            {graph.quantumPaths.map((p, i) => <option key={p.id} value={p.id} disabled={p.provider !== 'simulation' || !!p.viaEveId}>
              Nghe lén đường đến {name(p.target)} · {name(p.source)} → {name(p.target)} · QKD {i + 1}{p.provider !== 'simulation' ? ' · Phần cứng không hỗ trợ Eve' : p.viaEveId ? ` · đã có ${name(p.viaEveId)}` : ''}
            </option>)}
          </select></Field>
          {!graph.quantumPaths.length && <p className="lab-muted">Tạo phiên QKD giữa các Bên tham gia trước để có đường truyền gắn Eve.</p>}
          {graph.quantumPaths.filter(p => p.viaEveId === node.id).map(p => <div key={p.id}>
            <p>{name(p.source)} → {name(p.target)} · {p.id.slice(0, 8)}</p>
            <NumberField label={`Khoảng lệch Eve so với đầu thu ${name(p.target)} (rE, m)`} value={p.eveOffsetMeters ?? 100} max={200} step={0.5}
              onChange={eveOffsetMeters => change({ ...graph, quantumPaths: graph.quantumPaths.map(q => q.id === p.id ? { ...q, eveOffsetMeters } : q) })} />
          </div>)}
        </>}
      </>}
      {path && session && <>
        <p className="lab-tag">ĐƯỜNG TRUYỀN QKD · {vi(path.provider)}</p>
        <p className="lab-route">{name(path.source)} → {name(path.target)}</p>
        {path.viaEveId && <p className="lab-note">{name(path.viaEveId)} thu quang gần {name(path.target)} trên đường {name(path.source)} → {name(path.target)}. Đường QKD không đi qua Eve.</p>}
        <Field label="Nguồn thực hiện"><select value={path.provider} onChange={e => {
          if (e.target.value === 'thorlabs' && path.viaEveId) return;
          updatePath({ provider: e.target.value as QuantumPath['provider'], providerConfig: e.target.value === 'simulation' ? { model: 'ideal' } : {} });
        }}><option value="simulation">Mô phỏng phần mềm</option><option value="thorlabs" disabled={!!path.viaEveId}>Thorlabs EDU-QCRY1</option></select></Field>
        {path.provider === 'thorlabs' ? <p className="lab-note">Mô hình tương tự phân cực vật lý · đo thủ công. Tối đa 64 trạng thái/đường truyền. Nhập D0/D1 trong Quy trình QKD; mỗi phép đo chỉ ghi nhận một lần.</p> : <>
          <Field label="Mô hình kênh"><select value={config?.model} onChange={e => updateConfig({ model: e.target.value as SimulationProviderConfig['model'] })}><option value="ideal">Lý tưởng</option><option value="current_fso">FSO hiện tại</option></select></Field>
          {config?.model === 'current_fso' && <>
            <Field label="Bộ dữ liệu"><select value={config.dataset ?? 'clearlowSI.csv'} onChange={e => updateConfig({ dataset: e.target.value as SimulationProviderConfig['dataset'] })}>
              <option value="clearlowSI.csv">SI thấp</option><option value="clearhighSI.csv">SI cao</option><option value="lightrain.csv">Mưa nhẹ</option>
            </select></Field>
            <NumberField label="Vị trí bắt đầu cửa sổ" value={config.windowStart ?? 0} max={16777215} onChange={windowStart => updateConfig({ windowStart })} />
            <NumberField label="Công suất (dBm)" value={config.Pt_dBm ?? 5} min={-5} max={10} step={0.5} onChange={Pt_dBm => updateConfig({ Pt_dBm })} />
            <NumberField label="Góc thiên đỉnh (°)" value={config.xi ?? 30} max={60} onChange={xi => updateConfig({ xi })} />
            <Field label="Ngưỡng thu"><select value={config.thresholdMode ?? 'adaptive'} onChange={e => updateConfig({ thresholdMode: e.target.value as 'adaptive' | 'fixed' })}><option value="adaptive">Thích nghi · PolicyNet</option><option value="fixed">Cố định</option></select></Field>
            {config.thresholdMode === 'fixed' && <NumberField label="Ngưỡng ρ cố định" value={config.fixedRho ?? 1} max={5} step={0.05} onChange={fixedRho => updateConfig({ fixedRho })} />}
          </>}
        </>}
        <Field label="Eve gần đầu thu"><select disabled={path.provider === 'thorlabs'} value={path.viaEveId ?? ''} onChange={e => updatePath({ viaEveId: e.target.value || undefined, eveOffsetMeters: e.target.value ? path.eveOffsetMeters ?? 100 : undefined })}>
          <option value="">Không có Eve</option>{graph.nodes.filter(n => n.type === 'eavesdropper').map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select></Field>
        {path.viaEveId && <>
          <NumberField label="Khoảng lệch Eve so với đầu thu (rE, m)" value={path.eveOffsetMeters ?? 100} max={200} step={0.5} onChange={eveOffsetMeters => updatePath({ eveOffsetMeters })} />
          <p className="lab-muted">Khoảng lệch tính từ {name(path.target)}. {config?.model === 'current_fso' ? 'FSO tính tín hiệu Eve thu được theo suy hao Gaussian và nhiễu thu.' : 'Kênh lý tưởng dùng xác suất thu theo chồng lấn Gaussian; chọn FSO hiện tại để dùng tín hiệu quang và nhiễu thu.'} Nghe lén thụ động không tự tăng QBER.</p>
        </>}
        {(path.provider === 'thorlabs' || path.viaEveId) && <p className="lab-muted">Không hỗ trợ Eve trên phần cứng. Gỡ Eve trước khi chọn Phần cứng.</p>}
        <h3>Phiên QKD</h3>
        <p className="lab-route">{session.participantIds.map(name).join(' ↔ ')}</p>
        <p className="lab-tag">{session.protocol === 'direct_bb84' ? 'BB84 trực tiếp' : 'Phân phối khóa tin cậy'}</p>
        {session.distributorId && <p className="lab-muted">Qua {name(session.distributorId)} · {session.pathIds.length} đường truyền · cùng một chuỗi.</p>}
        <NumberField label="Độ dài chuỗi" value={session.config.sequenceLength} min={1} onChange={sequenceLength => change({ ...graph, qkdSessions: graph.qkdSessions.map(s => s.id === session.id ? { ...s, config: { ...s.config, sequenceLength } } : s) })} />
        <NumberField label="Hạt giống ngẫu nhiên gốc" value={session.config.masterSeed} max={4294967295} onChange={masterSeed => change({ ...graph, qkdSessions: graph.qkdSessions.map(s => s.id === session.id ? { ...s, config: { ...s.config, masterSeed } } : s) })} />
        <p className="lab-muted">Hủy khi QBER ≥11% · số bit dự phòng bảo mật {session.config.securityMarginBits} bit.</p>
        <button onClick={() => openProtocol(session.id)}>Mở quy trình QKD</button>
      </>}
      {edge && <>
        <p className="lab-tag">ĐƯỜNG DỮ LIỆU</p>
        <p className="lab-route">{name(edge.source)} → {name(edge.target)}</p>
        <Field label="Bảo vệ dữ liệu"><select value={edge.config.protection} onChange={e => change({ ...graph, edges: graph.edges.map(d => d.id === edge.id ? { ...d, config: { ...d.config, protection: e.target.value as 'none' | 'aes_256_gcm' } } : d) })}><option value="aes_256_gcm">AES-256-GCM</option><option value="none">Không mã hóa · bản rõ</option></select></Field>
        <Field label="Nguồn khóa"><select disabled={edge.config.protection === 'none'} value={edge.config.keySource} onChange={e => change({ ...graph, edges: graph.edges.map(d => d.id === edge.id ? { ...d, config: { ...d.config, keySource: e.target.value } } : d) })}>
          <option value="auto">Tự động</option>
          {compatibleSessions(graph, edge.source, edge.target).map((s, index) => <option key={s.id} value={s.id}>{vi(s.protocol)} · {index + 1} · {s.id.slice(0, 8)}</option>)}
          {edge.config.keySource !== 'auto' && !compatibleSessions(graph, edge.source, edge.target).some(s => s.id === edge.config.keySource) && <option value={edge.config.keySource}>Nguồn không còn phù hợp</option>}
        </select></Field>
        <p className="lab-note">{edge.config.protection === 'none' ? 'Đường dữ liệu không mã hóa.' : 'ĐANG CHỜ KHÓA CHUNG · chưa chạy QKD.'} Nội dung truyền sẽ được nhập khi chạy thí nghiệm và không lưu trong sơ đồ.</p>
      </>}
      {(node || path || edge) && <div className="lab-delete">
        <p className="lab-muted">{node ? node.type === 'eavesdropper' ? 'Xóa Eve chỉ gỡ nghe lén khỏi các đường QKD.' : 'Xóa thực thể sẽ xóa các phiên QKD và dữ liệu nối với thực thể này.' : path ? 'Xóa đường truyền sẽ xóa toàn bộ phiên QKD, gồm cả đường truyền còn lại nếu có.' : 'Xóa đường truyền dữ liệu đã chọn.'} Có thể Hoàn tác.</p>
        <button type="button" className="danger" onClick={remove}>{node ? 'Xóa thực thể và kết nối' : path ? 'Xóa phiên QKD' : 'Xóa đường dữ liệu'}</button>
      </div>}
    </aside>
  );
}
