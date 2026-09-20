import { configuredApiUrl } from './client';
import { designerApiBase } from './designerUrl';
import type { SystemGraph } from '../types/system';
import type { ProtocolGraph } from '../types/protocol';
import type { ExperimentInput, ExperimentResult, MeasurementAck } from '../types/experiment';

export interface ValidationIssue {
  code: string;
  message: string;
  entityId: string | null;
  path: (string | number)[];
}
export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
export interface DesignerCatalog {
  schemaVersion: number;
  executionAvailable: boolean;
  nodeTypes: string[];
  edgeTypes: string[];
  protocols: string[];
  providers: { id: string; models: string[]; supportsEve: boolean }[];
  stages: { id: string; label: string }[];
}

async function request<T>(route: string, signal: AbortSignal, graph?: SystemGraph): Promise<T> {
  const response = await fetch(`${designerApiBase(configuredApiUrl)}/${route}`, {
    method: graph ? 'POST' : 'GET', signal,
    ...(graph ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graph }) } : {}),
  });
  if (!response.ok) throw new Error(`Máy chủ ${response.status}: không thể kiểm tra thiết kế.`);
  return response.json();
}

export const getDesignerCatalog = (signal: AbortSignal) => request<DesignerCatalog>('catalog', signal);
export const validateDesign = (graph: SystemGraph, signal: AbortSignal) => request<ValidationResult>('validate', signal, graph);

async function postDesigner<T>(route: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${designerApiBase(configuredApiUrl)}/${route}`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || payload.valid === false) {
    const codes = payload.errors?.map((issue: {code: string}) => issue.code).join(', ');
    throw new Error(codes || payload.detail || `Máy chủ ${response.status}`);
  }
  return payload;
}
export const getProtocols = (graph: SystemGraph, signal: AbortSignal) => postDesigner<{protocols: ProtocolGraph[]}>('protocols', { graph }, signal);
export const runSoftwareExperiment = (graph: SystemGraph, signal: AbortSignal) => postDesigner<ExperimentResult>('experiments', { graph, scope: 'software_acquisition' }, signal);
export const runQkdExperiment = (graph: SystemGraph, input: ExperimentInput, signal: AbortSignal) => postDesigner<ExperimentResult>('experiments', { graph, scope: 'qkd', input }, signal);
export const runAcquisition = (graph: SystemGraph, signal: AbortSignal) => postDesigner<ExperimentResult>('experiments', { graph, scope: 'acquisition' }, signal);
export const submitMeasurement = (id: string, taskId: string, detector: 'D0' | 'D1', signal: AbortSignal) => postDesigner<MeasurementAck>(`experiments/${encodeURIComponent(id)}/measurement`, { task_id: taskId, detector }, signal);
export const cancelExperiment = (id: string, signal: AbortSignal) => postDesigner<ExperimentResult>(`experiments/${encodeURIComponent(id)}/cancel`, {}, signal);
export async function getExperiment(id: string, signal: AbortSignal): Promise<ExperimentResult> {
  const response = await fetch(`${designerApiBase(configuredApiUrl)}/experiments/${encodeURIComponent(id)}`, { signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || `Máy chủ ${response.status}`);
  return payload;
}
