import { diagnosticText, vi } from '../../../i18n/vi';
import { useEffect, useRef, useState } from 'react';
import { getProtocols, runAcquisition, runQkdExperiment } from '../../../api/designer';
import type { SystemGraph } from '../../../types/system';
import type { ProtocolGraph } from '../../../types/protocol';
import type { ExperimentResult } from '../../../types/experiment';
import { NumberField } from '../system/SystemInspector';
import ProtocolCanvas from './ProtocolCanvas';
import HardwarePanel from '../experiment/HardwarePanel';
import ComparisonPanel from '../experiment/ComparisonPanel';
import ExperimentPanel from '../experiment/ExperimentPanel';
import DataInputPanel, { type DataDraft } from '../experiment/DataInputPanel';

export default function ProtocolWorkspace({ graph, sessionId, choose, change, active }: {
  graph: SystemGraph; sessionId: string; choose: (id: string) => void; change: (graph: SystemGraph) => void; active: boolean;
}) {
  const [templates, setTemplates] = useState<{graph: SystemGraph; protocols: ProtocolGraph[]}>();
  const [error, setError] = useState('');
  const [templateError, setTemplateError] = useState('');
  const [pending, setPending] = useState(false);
  const [dataDrafts, setDataDrafts] = useState<Record<string, DataDraft>>({});
  const [run, setRun] = useState<{graph: SystemGraph; result: ExperimentResult}>();
  const runController = useRef<AbortController | null>(null);
  useEffect(() => () => runController.current?.abort(), []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); setTemplateError('Máy chủ chưa phản hồi quy trình sau 20 giây.'); }, 20000);
    getProtocols(graph, controller.signal).then(response => {
      if (!controller.signal.aborted) { setTemplates({ graph, protocols: response.protocols }); setTemplateError(''); }
    }).catch(e => { if (!controller.signal.aborted) setTemplateError(e instanceof Error ? e.message : 'Không tải được quy trình.'); })
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [graph, active]);
  const session = graph.qkdSessions.find(s => s.id === sessionId) ?? graph.qkdSessions[0];
  const protocol = templates?.graph === graph ? templates.protocols.find(p => p.sessionId === session?.id) : undefined;
  const name = (id: string) => graph.nodes.find(n => n.id === id)?.name ?? id;
  const waiting = run?.result.state === 'waiting_for_hardware';
  const execute = async (scope: 'acquisition' | 'qkd') => {
    if (graph.quantumPaths.some(p => p.provider === 'thorlabs' && (graph.qkdSessions.find(s => s.id === p.sessionId)?.config.sequenceLength ?? 0) > 64)) {
      setError('Thorlabs đo thủ công hỗ trợ tối đa 64 trạng thái/đường truyền. Giảm Độ dài chuỗi của phiên rồi chạy lại.'); return;
    }
    const dataInputs = scope === 'qkd' ? graph.edges.filter(e => dataDrafts[e.id]?.enabled).map(e => ({ edgeId: e.id, plaintext: dataDrafts[e.id].plaintext })) : [];
    if (dataInputs.some(i => new TextEncoder().encode(i.plaintext).length > 500000)) { setError('Nội dung truyền vượt 500 KB mỗi đường dữ liệu.'); return; }
    const controller = new AbortController(); runController.current = controller;
    const timer = setTimeout(() => controller.abort(), 60000);
    setPending(true); setError('');
    try { setRun({ graph, result: scope === 'qkd' ? await runQkdExperiment(graph, { dataInputs }, controller.signal) : await runAcquisition(graph, controller.signal) }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thu nhận được dữ liệu.'); }
    finally { clearTimeout(timer); setPending(false); }
  };
  return <section className="lab-results">
    <h2>Quy trình QKD {session && ` / ${session.participantIds.map(name).join(' ↔ ')}`}</h2>
    <div className="lab-toolbar">
      <label>Phiên QKD<select aria-label="Phiên QKD" value={session?.id ?? ''} onChange={e => choose(e.target.value)}>{graph.qkdSessions.map(s => <option key={s.id} value={s.id}>{s.participantIds.map(name).join(' ↔ ')} · {vi(s.protocol)} · {s.id.slice(0, 8)}</option>)}</select></label>
      <button disabled={pending || waiting || !session} onClick={() => execute('acquisition')}>Thu nhận dữ liệu → QBER</button>
      <button className="primary" disabled={pending || waiting || (!session && !graph.edges.length)} onClick={() => execute('qkd')}>{pending ? 'Đang chạy…' : 'Chạy QKD + Dữ liệu'}</button>
    </div>
    <p>Chạy tất cả các phiên trong sơ đồ. Mô phỏng lý tưởng/FSO hỗ trợ Eve thu quang gần đầu thu; Thorlabs đo thủ công không hỗ trợ Eve trên phần cứng. QKD + Dữ liệu thực hiện hậu xử lý khóa và truyền các đường dữ liệu được chọn.</p>
    <DataInputPanel graph={graph} drafts={dataDrafts} change={(id, draft) => setDataDrafts(previous => ({ ...previous, [id]: draft }))} />
    {error && <p role="alert">{diagnosticText(error)}</p>}
    {templateError && <p role="alert">Quy trình: {diagnosticText(templateError)}</p>}
    {!session && <p>Tạo phiên QKD trong Sơ đồ hệ thống để xem quy trình.</p>}
    {session && <div className="lab-protocol-config">
      <NumberField label="Độ dài chuỗi của giao thức" value={session.config.sequenceLength} min={1} onChange={sequenceLength => change({ ...graph, qkdSessions: graph.qkdSessions.map(s => s.id === session.id ? { ...s, config: { ...s.config, sequenceLength } } : s) })} />
      <NumberField label="Hạt giống ngẫu nhiên gốc của giao thức" value={session.config.masterSeed} max={4294967295} onChange={masterSeed => change({ ...graph, qkdSessions: graph.qkdSessions.map(s => s.id === session.id ? { ...s, config: { ...s.config, masterSeed } } : s) })} />
    </div>}
    {active && protocol && <ProtocolCanvas key={session!.id} protocol={protocol} result={run?.graph === graph ? run.result.sessions.find(s => s.sessionId === session?.id) : undefined} />}
    {run?.result.progress && <HardwarePanel key={run.result.id} result={run.result} update={result => setRun(previous => previous?.result.id === result.id ? { ...previous, result } : previous)} />}
    {run && <ExperimentPanel result={run.result} stale={run.graph !== graph} />}
    <ComparisonPanel result={run?.result} />
  </section>;
}
