import { flowAriaLabels, vi } from '../../../i18n/vi';
import { useMemo, useState } from 'react';
import { Background, Controls, MiniMap, ReactFlow, MarkerType, type Connection, type NodeChange, type ReactFlowInstance, type Edge } from '@xyflow/react';
import type { Selection, SystemGraph, SystemNodeType } from '../../../types/system';
import ActorNode, { type ActorFlowNode } from './ActorNode';

const nodeTypes = { actor: ActorNode };
interface Props {
  graph: SystemGraph;
  selection: Selection;
  select: (value: Selection) => void;
  move: (changes: NodeChange<ActorFlowNode>[]) => void;
  onDragStart: () => void;
  onDragStop: () => void;
  connect: (connection: Connection) => void;
  addNode: (type: SystemNodeType, position: { x: number; y: number }) => void;
  openProtocol: (id: string) => void;
}

export default function SystemCanvas({ graph, selection, select, move, onDragStart, onDragStop, connect, addNode, openProtocol }: Props) {
  const [flow, setFlow] = useState<ReactFlowInstance<ActorFlowNode, Edge> | null>(null);
  const nodes = useMemo<ActorFlowNode[]>(() => [...graph.nodes.filter(n => !graph.quantumPaths.some(p => p.viaEveId === n.id)).map(n => ({
    id: n.id, type: 'actor' as const, position: n.position, data: { name: n.name, kind: n.type, footprint: graph.quantumPaths.some(p => p.target === n.id && p.viaEveId) },
    selected: selection?.kind === 'node' && selection.id === n.id,
    ariaLabel: `${n.name}, ${vi(n.type)}`,
  })), ...graph.quantumPaths.filter(p => p.viaEveId).flatMap(p => {
    const eve = graph.nodes.find(n => n.id === p.viaEveId);
    const receiver = graph.nodes.find(n => n.id === p.target);
    if (!eve || !receiver) return [];
    const index = graph.quantumPaths.filter(q => q.target === p.target && q.viaEveId).findIndex(q => q.id === p.id);
    // One visual observation per link. Receiver movement carries its Eve markers;
    // canvas pixels are illustrative, physical offset is configured in metres.
    return [{ id: `eve-observer:${p.id}`, type: 'actor' as const, draggable: false,
      position: { x: receiver.position.x + 230, y: receiver.position.y + 150 + index * 145 },
      data: { name: eve.name, kind: eve.type, entityId: eve.id, pathId: p.id, detail: `Gần ${receiver.name} · rE ${p.eveOffsetMeters ?? 100} m` },
      selected: selection?.kind === 'path' && selection.id === p.id || selection?.kind === 'node' && selection.id === eve.id,
      ariaLabel: `${eve.name} thu quang gần ${receiver.name}, đường ${p.id}, khoảng lệch ${p.eveOffsetMeters ?? 100} m`,
    }];
  })], [graph.nodes, graph.quantumPaths, selection]);
  const edges = useMemo<Edge[]>(() => [
    ...graph.quantumPaths.flatMap(p => {
      return [{
        id: `${p.id}:qkd`, source: p.source, target: p.target, type: 'smoothstep',
        ariaLabel: `Đường QKD từ ${graph.nodes.find(n => n.id === p.source)?.name} đến ${graph.nodes.find(n => n.id === p.target)?.name}`,
        sourceHandle: 'qkd-out', targetHandle: 'qkd-in', data: { kind: 'path', id: p.id },
        label: `QKD · ${vi(p.provider)}`,
        selected: selection?.kind === 'path' && selection.id === p.id,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#c41624' },
        style: { stroke: '#c41624', strokeWidth: 3 },
        labelStyle: { fill: '#a5111d', fontWeight: 700, fontSize: 11 }, labelBgPadding: [8, 5] as [number, number],
      }, ...(p.viaEveId ? [{
        id: `${p.id}:offset`, source: p.target, target: `eve-observer:${p.id}`, type: 'straight',
        sourceHandle: 'qkd-out', targetHandle: 'qkd-in', data: { kind: 'path', id: p.id },
        label: `rE = ${p.eveOffsetMeters ?? 100} m · QKD ${graph.quantumPaths.indexOf(p) + 1}`,
        ariaLabel: `Khoảng lệch Eve so với đầu thu, đường ${p.id}`,
        style: { stroke: '#b45309', strokeWidth: 2, strokeDasharray: '5 5' },
        labelStyle: { fill: '#92400e', fontSize: 11 },
      }] : [])];
    }),
    ...graph.edges.map(e => ({
      id: e.id, source: e.source, target: e.target, type: 'smoothstep', sourceHandle: 'data-out', targetHandle: 'data-in',
      ariaLabel: `Đường dữ liệu từ ${graph.nodes.find(n => n.id === e.source)?.name} đến ${graph.nodes.find(n => n.id === e.target)?.name}`,
      data: { kind: 'data', id: e.id }, label: `Dữ liệu → ${e.config.protection === 'none' ? 'Không mã hóa' : 'AES'}`,
      selected: selection?.kind === 'data' && selection.id === e.id,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' },
      style: { stroke: '#475569', strokeWidth: 1.8, strokeDasharray: '7 4' },
      labelStyle: { fill: '#475569', fontSize: 11 }, labelBgPadding: [8, 5] as [number, number],
    })),
  ], [graph.quantumPaths, graph.edges, graph.nodes, selection]);
  return (
    <div className="lab-canvas" aria-label="Vùng vẽ hệ thống"
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
      onDrop={event => {
        event.preventDefault();
        const type = event.dataTransfer.getData('application/quantumshield-node');
        if (flow && ['participant', 'key_distributor', 'eavesdropper'].includes(type)) {
          addNode(type as SystemNodeType, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        }
      }}>
      <ReactFlow<ActorFlowNode, Edge>
        ariaLabelConfig={flowAriaLabels} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={setFlow}
        onNodesChange={move} onNodeDragStart={onDragStart} onNodeDragStop={onDragStop}
        onNodeClick={(_, node) => select(node.data.pathId ? { kind: 'path', id: node.data.pathId } : { kind: 'node', id: node.id })}
        onEdgeClick={(_, edge) => select(edge.data as NonNullable<Selection>)}
        onEdgeDoubleClick={(_, edge) => {
          const path = graph.quantumPaths.find(p => edge.data?.kind === 'path' && p.id === edge.data.id);
          if (path) openProtocol(path.sessionId);
        }}
        onPaneClick={() => select(null)} onConnect={connection => connect({ ...connection,
          source: nodes.find(n => n.id === connection.source)?.data.entityId ?? connection.source,
          target: nodes.find(n => n.id === connection.target)?.data.entityId ?? connection.target,
        })}
        deleteKeyCode={null} multiSelectionKeyCode={null} selectionOnDrag={false}
        fitView fitViewOptions={{ padding: 0.25, maxZoom: 1 }} minZoom={0.2} maxZoom={2}
      >
        <Background gap={24} color="#d5deed" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={node => node.data.kind === 'eavesdropper' ? '#f59e0b' : node.data.kind === 'key_distributor' ? '#e46a73' : '#d5dce5'} />
      </ReactFlow>
      {!nodes.length && <div className="lab-empty">Thêm Bên tham gia từ bảng bên trái để bắt đầu.</div>}
    </div>
  );
}
