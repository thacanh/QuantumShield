import type { ExperimentResult } from '../../../types/experiment';

export interface ComparisonSnapshot {
  id: string; scope: string; state: string;
  learningDecision?: string;
  sessions: { id: string; label: string; protocol: string; seed: number; length: number; margin: number; paths: string[];
    reception: string[];
    sifted: number; siftRatio: number; qber: number | null; leakage: number | null; fallback: boolean | null;
    finalBits: number | null; estimatedEve: number; qkdStatus: string | null; keyStatus: string }[];
  data: { id: string; route: string; protection: string; application: string; transmission: string; aesReady: boolean; integrityVerified: boolean }[];
}

export function comparisonSnapshot(result: ExperimentResult): ComparisonSnapshot | undefined {
  if (['waiting_for_hardware', 'processing'].includes(result.state) || !result.sessions.length) return;
  const graph = result.graphSnapshot;
  const name = (id: string) => graph.nodes.find(n => n.id === id)?.name ?? id;
  return {
    id: result.id, scope: result.scope, state: result.state,
    sessions: result.sessions.map(s => {
      const config = graph.qkdSessions.find(q => q.id === s.sessionId)!;
      return { id: s.sessionId, label: config.participantIds.map(name).join(' ↔ '), protocol: s.protocol,
        seed: config.config.masterSeed, length: config.config.sequenceLength, margin: config.config.securityMarginBits,
        paths: graph.quantumPaths.filter(p => p.sessionId === s.sessionId).map(p => {
          const c = p.providerConfig;
          const provider = p.provider === 'thorlabs' ? 'Phần cứng/đo thủ công' : c.model === 'current_fso'
            ? `Mô phỏng/FSO ${c.dataset ?? 'clearlowSI.csv'} vị trí bắt đầu=${c.windowStart ?? 0} công suất=${c.Pt_dBm ?? 5}dBm góc thiên đỉnh=${c.xi ?? 30}° ${c.thresholdMode === 'fixed' ? 'cố định' : 'thích nghi'}${c.thresholdMode === 'fixed' ? ` ρ=${c.fixedRho ?? 1}` : ''}` : 'Mô phỏng/lý tưởng';
          return `${[p.source, p.target].map(name).join(' → ')} · ${provider} · Eve ${p.viaEveId ? `${name(p.viaEveId)} gần ${name(p.target)} · rE ${p.eveOffsetMeters ?? 100} m` : 'không'}`;
        }), reception: (s.pathResults ?? []).map(p => `${p.pathId.slice(0, 8)} · ρ=${p.rho?.toFixed(4) ?? '—'} · phát hiện ${p.detectedCount}/${p.measuredCount} · xóa ${p.erasedCount}`), sifted: s.siftedCount, siftRatio: s.siftRatio, qber: s.qber,
        leakage: s.reconciliation?.leakedBits ?? null, fallback: s.reconciliation?.fallbackUsed ?? null,
        finalBits: s.finalKeyLength ?? null, estimatedEve: s.estimated_eve_information_bits ?? 0,
        qkdStatus: s.qkdStatus, keyStatus: s.keyStatus };
    }),
    data: (result.dataResults ?? []).map(d => {
      const edge = graph.edges.find(e => e.id === d.edgeId)!;
      return { id: d.edgeId, route: `${name(edge.source)} → ${name(edge.target)}`, protection: d.protection, application: d.applicationStatus, transmission: d.transmissionStatus, aesReady: d.aesReady, integrityVerified: d.integrityVerified };
    }),
  };
}
