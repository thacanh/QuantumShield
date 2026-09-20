import { configuredApiUrl, postJson } from './client';
import type { SimulationRequest, SimulateResponse } from '../types/simulation';

// Preserve support for both a base URL and the legacy full simulation endpoint.
const simulationUrl = configuredApiUrl.includes('/simulate')
  ? configuredApiUrl
  : `${configuredApiUrl}/v1/simulate`;

export function simulate(request: SimulationRequest): Promise<SimulateResponse> {
  return postJson<SimulateResponse>(simulationUrl, request);
}
