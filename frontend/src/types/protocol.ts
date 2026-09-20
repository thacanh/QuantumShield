export type Artifact = 'prepared_states' | 'raw_measurements' | 'basis_metadata' | 'sifted_key_pair' | 'qber_report' | 'corrected_key_pair' | 'verified_key_pair' | 'secure_key_pair' | 'shared_key_handle';
export interface ProtocolStage {
  id: string; stage: string; label: string;
  actorId: string | null; actorName: string | null; pathId: string | null; provider?: string; routeLabel?: string;
  inputs: Record<string, Artifact>; outputs: Record<string, Artifact>;
  position: { x: number; y: number };
  attackModel?: 'receiver_side_fso'; eveReceiverId?: string; eveOffsetMeters?: number; eveName?: string;
}
export interface ProtocolGraph {
  version: 1; sessionId: string; protocol: string; nodes: ProtocolStage[];
  edges: { id: string; source: string; target: string; sourcePort: string; targetPort: string; artifact: Artifact }[];
}
