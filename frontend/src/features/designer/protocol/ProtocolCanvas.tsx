import { useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import type { ProtocolGraph, ProtocolStage } from '../../../types/protocol';
import type { AcquisitionResult, StageResult } from '../../../types/experiment';
import { flowAriaLabels, portLabel, vi } from '../../../i18n/vi';

type PipelineNode = Node<{ stage: ProtocolStage; result?: StageResult }, 'pipeline'>;
function PipelineCard({ data }: NodeProps<PipelineNode>) {
  return <div className={`lab-stage ${data.result?.status ?? ''}`}>
    {Object.keys(data.stage.inputs).map((port, i, ports) => <Handle key={port} id={port} type="target" position={Position.Top} style={{ left: `${(i + 1) / (ports.length + 1) * 100}%` }} />)}
    <strong>{vi(data.stage.stage)}</strong><small>{data.stage.routeLabel ?? data.stage.actorName ?? 'Xử lý phiên'} {data.stage.provider && `· ${vi(data.stage.provider)}`}</small>
    <span>{data.result ? vi(data.result.status) : 'Chưa chạy'}</span>
    <small>Đầu vào: {data.result?.inputCount ?? '—'} · Đầu ra: {data.result?.outputCount ?? '—'}</small>
    {Object.keys(data.stage.outputs).map((port, i, ports) => <Handle key={port} id={port} type="source" position={Position.Bottom} style={{ left: `${(i + 1) / (ports.length + 1) * 100}%` }} />)}
  </div>;
}
const nodeTypes = { pipeline: PipelineCard };

export default function ProtocolCanvas({ protocol, result }: { protocol: ProtocolGraph; result?: AcquisitionResult }) {
  const [selectedId, setSelectedId] = useState('prepare');
  const [flow, setFlow] = useState<ReactFlowInstance<PipelineNode> | null>(null);
  const selected = protocol.nodes.find(n => n.id === selectedId) ?? protocol.nodes[0];
  const choose = (stage: ProtocolStage) => {
    setSelectedId(stage.id);
    void flow?.setCenter(stage.position.x + 130, stage.position.y + 60, { zoom: 0.8, duration: 200 });
  };
  return <>
    <div className="lab-stage-navigation" aria-label="Các bước giao thức">{protocol.nodes.map(n => <button key={n.id} onClick={() => choose(n)}>{vi(n.stage)}{n.routeLabel || n.actorName ? ` · ${n.routeLabel ?? n.actorName}` : ''}</button>)}</div>
    <div className="lab-protocol-layout">
      <div className="lab-protocol-canvas" aria-label="Vùng vẽ quy trình">
        <ReactFlow<PipelineNode> nodes={protocol.nodes.map(stage => ({ id: stage.id, type: 'pipeline', position: stage.position, data: { stage, result: result?.stages.find(s => s.nodeId === stage.id) } }))}
          edges={protocol.edges.map(edge => ({ ...edge, sourceHandle: edge.sourcePort, targetHandle: edge.targetPort, type: 'smoothstep', ariaLabel: `Truyền ${vi(edge.artifact)}`, style: {stroke:'#e46a73'} }))}
          ariaLabelConfig={flowAriaLabels} nodeTypes={nodeTypes} onInit={setFlow} onNodeClick={(_, node) => setSelectedId(node.id)}
          nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
          defaultViewport={{ x: 20, y: 30, zoom: 0.7 }} minZoom={0.15} maxZoom={1.5}>
          <Background /><Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <aside className="lab-panel">
        <h3>{vi(selected.stage)}</h3><p>{selected.actorName}</p>
        <h4>Dữ liệu đầu vào</h4>{Object.entries(selected.inputs).map(([port, type]) => <p key={port}>{portLabel(port)}: {vi(type)}</p>)}
        {!Object.keys(selected.inputs).length && <p>Độ dài chuỗi + hạt giống ngẫu nhiên gốc của phiên.</p>}
        <h4>Dữ liệu đầu ra</h4>{Object.entries(selected.outputs).map(([port, type]) => <p key={port}>{portLabel(port)}: {vi(type)}</p>)}
        {selected.stage === 'error_correction' && <p>Cascade là mô hình giáo dục có bước sửa trực tiếp dự phòng và tính thêm số bit tiết lộ; không phải Cascade có xác thực dùng cho triển khai thực tế.</p>}
        {selected.stage === 'qber_estimation' && <p>Không còn bit sau sàng lọc: QBER không xác định. QBER ≥11% hủy phiên.</p>}
        {selected.stage === 'state_preparation' && <p>Một chuỗi duy nhất/phiên; bên phân phối khóa tin cậy phát cùng chuỗi cho hai bên nhận.</p>}
        {selected.attackModel && <p>{selected.routeLabel}: {selected.eveName} thu quang gần đầu thu, khoảng lệch {selected.eveOffsetMeters} m. Suy hao Gaussian giảm tín hiệu Eve thu được; trạng thái phát và kênh thu hợp lệ giữ nguyên. Đây là mô hình giáo dục.</p>}
        <p>Quy trình cố định. Chỉnh chuỗi và hạt giống ngẫu nhiên ở cấu hình phiên; nguồn thực hiện thuộc từng đường truyền.</p>
      </aside>
    </div>
  </>;
}
