import type { SystemGraph, SystemNodeType, QkdProtocol, SimulationProviderConfig } from '../../../types/system';

export const STORAGE_KEY = 'quantumshield.visual-lab.v1';
export const MAX_IMPORT_BYTES = 2_000_000;
const fail = (message: string): never => { throw new Error(`INVALID_SYSTEM_GRAPH: ${message}`); };
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`${field} phải là đối tượng.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return fail(`${field} không hợp lệ.`);
  return value;
}
function number(value: unknown, field: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) return fail(`${field} ngoài giới hạn.`);
  return value;
}
function choice<const T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) return fail(`${field} không được hỗ trợ.`);
  return value as T;
}
function array(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fail(`${field} phải là danh sách, tối đa ${max} phần tử.`);
  return value;
}

// Construct every persisted object explicitly. Never spread untrusted config objects.
export function sanitizeGraphForPersistence(input: unknown): SystemGraph {
  const g = record(input, 'graph');
  if (g.schema !== 'quantumshield-system' || g.version !== 1) return fail('Cấu trúc/phiên bản không được hỗ trợ.');
  const graph: SystemGraph = {
    schema: 'quantumshield-system', version: 1, id: text(g.id, 'graph.id'), name: text(g.name, 'graph.name', 200),
    nodes: array(g.nodes, 'nodes', 100).map((item) => {
      const n = record(item, 'node'); const position = record(n.position, 'position');
      return {
        id: text(n.id, 'node.id'), name: text(n.name, 'node.name', 200),
        type: choice<SystemNodeType>(n.type, ['participant', 'key_distributor', 'eavesdropper'], 'node.type'),
        position: { x: number(position.x, 'x', -100000, 100000), y: number(position.y, 'y', -100000, 100000) }, config: {},
      };
    }),
    edges: array(g.edges, 'edges', 200).map(item => {
      const e = record(item, 'edge'); const c = record(e.config, 'edge.config');
      if (e.type !== 'data_link') return fail('Chỉ đường dữ liệu được lưu trong edges; QKD dùng quantumPaths.');
      return {
        id: text(e.id, 'edge.id'), type: 'data_link', source: text(e.source, 'source'), target: text(e.target, 'target'),
        config: { protection: choice(c.protection, ['none', 'aes_256_gcm'], 'protection'), keySource: text(c.keySource, 'keySource') },
      };
    }),
    qkdSessions: array(g.qkdSessions, 'qkdSessions', 100).map(item => {
      const s = record(item, 'session'); const c = record(s.config, 'session.config');
      const participants = array(s.participantIds, 'participantIds', 2).map(id => text(id, 'participantId'));
      if (participants.length !== 2) return fail('Phiên cần đúng hai bên tham gia.');
      return {
        id: text(s.id, 'session.id'), protocol: choice<QkdProtocol>(s.protocol, ['direct_bb84', 'trusted_distributor'], 'protocol'),
        participantIds: [participants[0], participants[1]],
        ...(s.distributorId === undefined ? {} : { distributorId: text(s.distributorId, 'distributorId') }),
        pathIds: array(s.pathIds, 'pathIds', 2).map(id => text(id, 'pathId')),
        config: {
          sequenceLength: number(c.sequenceLength, 'sequenceLength', 1, 65536, true),
          masterSeed: number(c.masterSeed, 'masterSeed', 0, 4294967295, true),
          qberAbortThreshold: number(c.qberAbortThreshold, 'qberAbortThreshold', 0.11, 0.11),
          securityMarginBits: number(c.securityMarginBits, 'securityMarginBits', 0, 65536, true),
        },
      };
    }),
    quantumPaths: array(g.quantumPaths, 'quantumPaths', 200).map(item => {
      const p = record(item, 'path'); const c = record(p.providerConfig, 'providerConfig');
      const provider = choice(p.provider, ['simulation', 'thorlabs'], 'provider');
      let config: SimulationProviderConfig | Record<string, never> = {};
      if (provider === 'simulation') {
        config = { model: choice(c.model, ['ideal', 'current_fso'], 'model') };
        if (c.dataset !== undefined) config.dataset = choice(c.dataset, ['clearlowSI.csv', 'clearhighSI.csv', 'lightrain.csv'], 'dataset');
        if (c.windowStart !== undefined) config.windowStart = number(c.windowStart, 'windowStart', 0, Number.MAX_SAFE_INTEGER, true);
        if (c.Pt_dBm !== undefined) config.Pt_dBm = number(c.Pt_dBm, 'Pt_dBm', -5, 10);
        if (c.xi !== undefined) config.xi = number(c.xi, 'xi', 0, 60);
        if (c.thresholdMode !== undefined) config.thresholdMode = choice(c.thresholdMode, ['fixed', 'adaptive'], 'thresholdMode');
        if (c.fixedRho !== undefined) config.fixedRho = number(c.fixedRho, 'fixedRho', 0, 5);
      }
      return {
        id: text(p.id, 'path.id'), sessionId: text(p.sessionId, 'sessionId'), source: text(p.source, 'source'), target: text(p.target, 'target'),
        ...(p.viaEveId === undefined ? {} : { viaEveId: text(p.viaEveId, 'viaEveId') }),
        ...(p.eveOffsetMeters === undefined ? {} : { eveOffsetMeters: number(p.eveOffsetMeters, 'eveOffsetMeters', 0, 200) }), provider, providerConfig: config,
      };
    }),
  };
  const ids = [...graph.nodes, ...graph.edges, ...graph.quantumPaths, ...graph.qkdSessions].map(v => v.id);
  if (new Set(ids).size !== ids.length) return fail('Mã định danh phải duy nhất.');
  const node = (id: string) => graph.nodes.find(n => n.id === id);
  for (const e of graph.edges) {
    if (e.source === e.target || node(e.source)?.type !== 'participant' || node(e.target)?.type !== 'participant') return fail('Đường dữ liệu phải nối hai bên tham gia khác nhau.');
  }
  for (const s of graph.qkdSessions) {
    const [a, b] = s.participantIds;
    if (a === b || node(a)?.type !== 'participant' || node(b)?.type !== 'participant') return fail('Phiên có bên tham gia không hợp lệ.');
    if (new Set(s.pathIds).size !== s.pathIds.length) return fail('pathIds bị trùng.');
    const paths = s.pathIds.map(id => graph.quantumPaths.find(p => p.id === id));
    if (paths.some(p => !p || p.sessionId !== s.id)) return fail('Tham chiếu đường truyền/phiên không khớp.');
    if (s.protocol === 'direct_bb84') {
      if (s.distributorId || paths.length !== 1 || paths[0]?.source !== a || paths[0]?.target !== b) return fail('BB84 trực tiếp cần một đường truyền từ bên tham gia đầu đến bên tham gia sau.');
    } else {
      if (!s.distributorId || node(s.distributorId)?.type !== 'key_distributor' || paths.length !== 2 || paths.some(p => p?.source !== s.distributorId) || ![a, b].every(id => paths.some(p => p?.target === id))) return fail('Phiên phân phối khóa tin cậy cần hai đường truyền từ cùng bên phân phối tới hai bên tham gia.');
    }
  }
  for (const p of graph.quantumPaths) {
    if (!graph.qkdSessions.some(s => s.id === p.sessionId && s.pathIds.includes(p.id))) return fail('Đường truyền không thuộc phiên.');
    if (p.viaEveId && node(p.viaEveId)?.type !== 'eavesdropper') return fail('viaEveId không trỏ tới Eve.');
    if (p.viaEveId && p.provider === 'thorlabs') throw new Error('UNSUPPORTED_PHYSICAL_EVE: MVP không hỗ trợ Eve trên đường truyền Thorlabs.');
  }
  return graph;
}

export function exportDesign(graph: SystemGraph): string {
  return JSON.stringify({ schema: 'quantumshield-visual-lab', version: 1, graph: sanitizeGraphForPersistence(graph) }, null, 2);
}

export function importDesign(json: string): SystemGraph {
  if (new TextEncoder().encode(json).byteLength > MAX_IMPORT_BYTES) throw new Error('Tệp thiết kế vượt quá 2 MB.');
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return fail('Nội dung không phải JSON hợp lệ.'); }
  const envelope = record(parsed, 'tệp');
  if (envelope.schema !== 'quantumshield-visual-lab' || envelope.version !== 1) return fail('Định dạng nhập hoặc phiên bản không được hỗ trợ.');
  return sanitizeGraphForPersistence(envelope.graph);
}
