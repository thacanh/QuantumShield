export type SystemNodeType = 'participant' | 'key_distributor' | 'eavesdropper';
export type QkdProtocol = 'direct_bb84' | 'trusted_distributor';

export interface SystemNode {
  id: string;
  type: SystemNodeType;
  name: string;
  position: { x: number; y: number };
  config: Record<string, never>;
}

export interface QkdSession {
  id: string;
  protocol: QkdProtocol;
  participantIds: [string, string];
  distributorId?: string;
  pathIds: string[];
  config: {
    sequenceLength: number;
    masterSeed: number;
    qberAbortThreshold: number;
    securityMarginBits: number;
  };
}

export interface SimulationProviderConfig {
  model: 'ideal' | 'current_fso';
  dataset?: 'clearlowSI.csv' | 'clearhighSI.csv' | 'lightrain.csv';
  windowStart?: number;
  Pt_dBm?: number;
  xi?: number;
  thresholdMode?: 'fixed' | 'adaptive';
  fixedRho?: number;
}

export interface QuantumPath {
  id: string;
  sessionId: string;
  source: string;
  target: string;
  viaEveId?: string; // Legacy name: association at target, not an intermediate hop.
  eveOffsetMeters?: number;
  provider: 'simulation' | 'thorlabs';
  providerConfig: SimulationProviderConfig | Record<string, never>;
}

export interface DataEdge {
  id: string;
  type: 'data_link';
  source: string;
  target: string;
  config: { protection: 'none' | 'aes_256_gcm'; keySource: string };
}

// QKD canvas segments are derived from quantumPaths, never persisted as providers.
export interface SystemGraph {
  schema: 'quantumshield-system';
  version: 1;
  id: string;
  name: string;
  nodes: SystemNode[];
  edges: DataEdge[];
  quantumPaths: QuantumPath[];
  qkdSessions: QkdSession[];
}

export type Selection = { kind: 'node' | 'path' | 'data'; id: string } | null;
