import type { SystemGraph } from './system';

export interface StageResult {
  nodeId: string; status: 'completed' | 'aborted' | 'not_run'; inputCount: number | null; outputCount: number | null;
}
export interface AcquisitionResult {
  sessionId: string; protocol: string; acquisitionStatus: 'completed' | 'aborted';
  qkdStatus: 'completed' | 'aborted' | null; keyStatus: 'none' | 'distilled' | 'verified'; applicationStatus: ApplicationStatus;
  completedThrough: string; abortReason: string | null;
  finalKeyLength?: number; sharedKeyHandle?: string | null; estimated_eve_information_bits?: number;
  eveReport?: { model: 'none' | 'receiver_side_fso'; estimatorVersion: string; interpretation: string; estimatedInformationBits: number;
    paths: { pathId: string; eveId: string; receiverId: string; offsetMeters: number; gaussianOverlap: number; detectedCount: number; erasedCount: number; sampleCount: number; errorCount: number; peve: number | null; estimatedInformationBits: number }[] };
  reconciliation?: { success: boolean; leakedBits: number; fallbackUsed: boolean } | null;
  verification?: 'MATCH' | 'MISMATCH' | null;
  preparedCount: number; siftedCount: number; errorCount: number; qber: number | null; siftRatio: number;
  pathResults?: { pathId: string; model: string; origin: 'SIM' | 'HW'; measuredCount: number; detectedCount: number; erasedCount: number;
    dataset?: string; windowStart?: number; datasetSize?: number; thresholdMode?: string; rho?: number; channelMean?: number; channelStd?: number }[];
  stages: StageResult[];
  preview: { index: number; preparedBit: number; preparedBasis: string; kept: boolean;
    eve?: { eveId: string; pathId: string; measuredBit: number; basis: string; receiverId: string; origin: 'SIM' }[];
    measurements: { nodeId: string; bit: number; basis: string; origin: 'SIM' | 'HW' }[] }[];
}
export interface ExperimentResult {
  id: string; state: 'completed' | 'aborted' | 'failed' | 'waiting_for_hardware' | 'processing'; scope: 'ideal_acquisition' | 'ideal_qkd' | 'software_acquisition' | 'software_qkd' | 'acquisition' | 'qkd'; seedAlgorithm: string;
  graphSnapshot: SystemGraph; graphFingerprint: string; sessions: AcquisitionResult[];
  dataResults?: DataResult[];
  currentTask?: AcquisitionTask | null;
  progress?: { completed: number; total: number };
  diagnostic?: string;
}
export interface AcquisitionTask {
  taskId: string; experimentId: string; sessionId: string; pathId: string; roleNodeId: string; stateIndex: number;
  preparedBit: 0 | 1; preparedBasis: 'Z' | 'X'; measurementBasis: 'Z' | 'X'; status: 'pending';
  polarizationDeg: number; analyzerDeg: number;
}
export interface MeasurementAck { taskId: string; status: 'completed'; completedCount: number; result?: ExperimentResult }
export type ApplicationStatus = 'not_requested' | 'ready' | 'insufficient_key' | 'encrypted' | 'failed';
export interface ExperimentInput { dataInputs: { edgeId: string; plaintext: string }[] }
export interface DataResult {
  edgeId: string; sessionId: string | null; protection: 'none' | 'aes_256_gcm';
  applicationStatus: ApplicationStatus; transmissionStatus: 'not_requested' | 'delivered' | 'blocked' | 'failed';
  diagnostic: string | null; keyBitsAvailable: number; aesReady: boolean; integrityVerified: boolean;
  ciphertext?: string; nonce?: string; authenticationTag?: string; decryptedPayload?: string; receivedPayload?: string;
}
