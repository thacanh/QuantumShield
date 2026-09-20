export type ChannelDataset = 'clearlowSI.csv' | 'clearhighSI.csv' | 'lightrain.csv';
export type ThresholdMode = 'fixed' | 'adaptive';

export interface SimulationRequest {
  channel_dataset: ChannelDataset;
  window_start: number;
  sample_size: number;
  mode: ThresholdMode;
  fixed_rho: number;
  Pt_dBm: number;
  xi: number;
  eve_active: boolean;
  rE: number;
  document_name: string;
  plaintext_payload: string;
}

export interface SimulateResponse {
  channel_dataset: string;
  dataset_label: string;
  model_weights: string;
  window_start: number;
  dataset_size: number;
  sample_size: number;
  channel_mean: number;
  channel_std: number;
  rho: number;
  qber: number;
  psift: number;
  peve: number;
  eve_interception_strength: number;
  bits_preview: number[];
  sifted_key_len: number;
  ec_leaked_bits: number;
  estimated_eve_information_bits: number;
  final_key_len: number;
  final_key_alice: number[];
  final_key_bob: number[];
  accepted: boolean;
  abort_reason: string | null;
  encryption_algorithm: string;
  aes_key_bits_used: number;
  ciphertext: string;
  nonce: string;
  authentication_tag: string;
  decrypted_payload: string;
  integrity_verified: boolean;
}

export interface ExperimentRecord {
  timestamp: string;
  dataset: string;
  windowStart: number;
  mode: ThresholdMode;
  rho: number;
  qber: number;
  psift: number;
  peve: number;
  finalKeyLength: number;
  accepted: boolean;
}
