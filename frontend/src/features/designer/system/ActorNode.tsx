import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { SystemNodeType } from '../../../types/system';
import { nodeLabels } from './graph';

export type ActorFlowNode = Node<{ name: string; kind: SystemNodeType; entityId?: string; pathId?: string; footprint?: boolean; detail?: string }, 'actor'>;

export default function ActorNode({ data, selected }: NodeProps<ActorFlowNode>) {
  const participant = data.kind === 'participant';
  return (
    <div className={`lab-actor ${data.kind} ${data.footprint ? 'has-footprint' : ''} ${selected ? 'is-selected' : ''}`}>
      {data.kind !== 'key_distributor' && <Handle type="target" position={Position.Left} id="qkd-in" aria-label={data.kind === 'eavesdropper' ? 'Gắn với đầu thu QKD' : 'QKD vào'} />}
      <Handle type="source" position={Position.Right} id="qkd-out" aria-label={data.kind === 'eavesdropper' ? 'Gắn với đầu thu QKD' : 'QKD ra'} />
      <span className="lab-actor-kind">{nodeLabels[data.kind]}</span>
      <strong>{data.name || 'Chưa đặt tên'}</strong>
      <small>{data.kind === 'eavesdropper' ? (data.detail ?? 'Máy thu quang nghe lén') : participant ? 'QKD ↔ · Dữ liệu →' : 'Phân phối khóa cho hai bên'}</small>
      {participant && <>
        <Handle type="target" position={Position.Bottom} id="data-in" style={{ left: '30%' }} className="data-handle" aria-label="Dữ liệu vào" />
        <Handle type="source" position={Position.Bottom} id="data-out" style={{ left: '70%' }} className="data-handle" aria-label="Dữ liệu ra" />
      </>}
    </div>
  );
}
