import type { QkdProtocol, Selection, SystemGraph, SystemNodeType } from '../../../types/system';

export const nodeLabels: Record<SystemNodeType, string> = {
  participant: 'Bên tham gia', key_distributor: 'Bên phân phối khóa', eavesdropper: 'Eve',
};
export const makeId = () => crypto.randomUUID();
export const sessionDefaults = { sequenceLength: 8192, masterSeed: 42, qberAbortThreshold: 0.11, securityMarginBits: 32 };

export function emptyGraph(): SystemGraph {
  return { schema: 'quantumshield-system', version: 1, id: makeId(), name: 'Hệ thống QKD mới', nodes: [], edges: [], quantumPaths: [], qkdSessions: [] };
}

export function addSession(graph: SystemGraph, protocol: QkdProtocol, a: string, b: string, distributor?: string): SystemGraph {
  const node = (id?: string) => graph.nodes.find(n => n.id === id);
  if (a === b || node(a)?.type !== 'participant' || node(b)?.type !== 'participant') {
    throw new Error('Chọn hai bên tham gia khác nhau.');
  }
  if (protocol === 'trusted_distributor' && node(distributor)?.type !== 'key_distributor') {
    throw new Error('Chọn một bên phân phối khóa cho phiên.');
  }
  const id = makeId();
  const paths = (protocol === 'direct_bb84' ? [[a, b]] : [[distributor!, a], [distributor!, b]])
    .map(([source, target]) => ({ id: makeId(), sessionId: id, source, target, provider: 'simulation' as const, providerConfig: { model: 'ideal' as const } }));
  return {
    ...graph,
    quantumPaths: [...graph.quantumPaths, ...paths],
    qkdSessions: [...graph.qkdSessions, {
      id, protocol, participantIds: [a, b], pathIds: paths.map(p => p.id),
      ...(protocol === 'trusted_distributor' ? { distributorId: distributor } : {}),
      config: { ...sessionDefaults },
    }],
  };
}

export function addDataLink(graph: SystemGraph, source: string, target: string): SystemGraph {
  if (source === target || [source, target].some(id => graph.nodes.find(n => n.id === id)?.type !== 'participant')) {
    throw new Error('Đường dữ liệu cần hai bên tham gia khác nhau và có hướng từ nguồn đến đích.');
  }
  if (graph.edges.some(e => e.source === source && e.target === target)) throw new Error('Đường dữ liệu này đã tồn tại.');
  return { ...graph, edges: [...graph.edges, { id: makeId(), type: 'data_link', source, target, config: { protection: 'aes_256_gcm', keySource: 'auto' } }] };
}

export function compatibleSessions(graph: SystemGraph, a: string, b: string) {
  return graph.qkdSessions.filter(s => s.participantIds.includes(a) && s.participantIds.includes(b));
}

// A wire involving Eve attaches it to an existing whole path, never a new session.
export function eveConnectionPaths(graph: SystemGraph, source: string, target: string) {
  const sender = graph.nodes.find(n => n.id === source);
  const receiver = graph.nodes.find(n => n.id === target);
  const fromEve = sender?.type === 'eavesdropper';
  const toEve = receiver?.type === 'eavesdropper';
  if (!fromEve && !toEve) return null;
  if (!sender || !receiver || fromEve === toEve || (fromEve ? receiver : sender).type !== 'participant') {
    throw new Error('Chỉ nối Eve với đầu thu của đường QKD có sẵn; không nối Eve với nguồn phát hoặc Eve khác.');
  }
  return {
    eveId: fromEve ? source : target,
    paths: graph.quantumPaths.filter(p => p.target === (fromEve ? target : source)),
  };
}

export function attachEve(graph: SystemGraph, pathId: string, eveId: string): SystemGraph {
  const path = graph.quantumPaths.find(p => p.id === pathId);
  if (!path || !graph.nodes.some(n => n.id === eveId && n.type === 'eavesdropper')) throw new Error('Không tìm thấy đường truyền QKD hoặc Eve.');
  if (path.provider !== 'simulation') throw new Error('UNSUPPORTED_PHYSICAL_EVE: chỉ gắn Eve vào đường truyền mô phỏng.');
  if (path.viaEveId === eveId) return graph;
  if (path.viaEveId) throw new Error('Đường truyền đã có Eve khác. Gỡ Eve trong bảng cấu hình của đường truyền trước khi nối lại.');
  return { ...graph, quantumPaths: graph.quantumPaths.map(p => p.id === pathId ? { ...p, viaEveId: eveId, eveOffsetMeters: p.eveOffsetMeters ?? 100 } : p) };
}

export function designWarnings(graph: SystemGraph): string[] {
  return graph.edges.flatMap(e => {
    if (e.config.protection === 'none') return [];
    const candidates = compatibleSessions(graph, e.source, e.target);
    const label = `${graph.nodes.find(n => n.id === e.source)?.name} → ${graph.nodes.find(n => n.id === e.target)?.name}`;
    if (e.config.keySource !== 'auto') return candidates.some(s => s.id === e.config.keySource) ? [] : [`${label}: nguồn khóa đã chọn không còn phù hợp (NO_QKD_PATH).`];
    if (!candidates.length) return [`${label}: cần phiên QKD cho AES (NO_QKD_PATH).`];
    return candidates.length > 1 ? [`${label}: có nhiều phiên; chọn nguồn khóa (AMBIGUOUS_KEY_SOURCE).`] : [];
  });
}

// Explicit cascade deletion. UI describes the consequence and offers Undo.
export function removeEntity(graph: SystemGraph, selection: Selection): SystemGraph {
  if (!selection) return graph;
  if (selection.kind === 'data') return { ...graph, edges: graph.edges.filter(e => e.id !== selection.id) };
  const removedSessions = new Set(graph.quantumPaths.filter(p => selection.kind === 'path'
    ? p.id === selection.id
    : [p.source, p.target].includes(selection.id)).map(p => p.sessionId));
  return {
    ...graph,
    nodes: selection.kind === 'node' ? graph.nodes.filter(n => n.id !== selection.id) : graph.nodes,
    edges: selection.kind === 'node' ? graph.edges.filter(e => e.source !== selection.id && e.target !== selection.id) : graph.edges,
    quantumPaths: graph.quantumPaths.filter(p => !removedSessions.has(p.sessionId)).map(p => {
      if (selection.kind !== 'node' || p.viaEveId !== selection.id) return p;
      const detached = { ...p }; delete detached.viaEveId; delete detached.eveOffsetMeters; return detached;
    }),
    qkdSessions: graph.qkdSessions.filter(s => !removedSessions.has(s.id)),
  };
}

export function directTemplate(): SystemGraph {
  const graph = emptyGraph();
  graph.name = 'QKD trực tiếp';
  graph.nodes = [
    { id: makeId(), type: 'participant', name: 'Alice', position: { x: 50, y: 90 }, config: {} },
    { id: makeId(), type: 'participant', name: 'Bob', position: { x: 480, y: 90 }, config: {} },
  ];
  return addDataLink(addSession(graph, 'direct_bb84', graph.nodes[0].id, graph.nodes[1].id), graph.nodes[0].id, graph.nodes[1].id);
}

export type TemplateKind = 'direct' | 'trusted' | 'hybrid' | 'eve';
export function systemTemplate(kind: TemplateKind): SystemGraph {
  let graph = directTemplate();
  if (kind === 'direct') return graph;
  graph.nodes[1].position.x = 610;
  if (kind === 'eve') {
    const id = makeId();
    graph.name = 'Eve nghe lén';
    graph.nodes.push({ id, type: 'eavesdropper', name: 'Eve', position: { x: 330, y: 90 }, config: {} });
    graph.quantumPaths[0].viaEveId = id;
    graph.quantumPaths[0].eveOffsetMeters = 100;
    graph.quantumPaths[0].providerConfig = { model: 'current_fso' };
    return graph;
  }
  graph.nodes.forEach(n => { n.position.y = 270; });
  const id = makeId();
  graph.nodes.push({ id, type: 'key_distributor', name: 'Charlie', position: { x: 330, y: 20 }, config: {} });
  graph = addSession({ ...graph, quantumPaths: [], qkdSessions: [] }, 'trusted_distributor', graph.nodes[0].id, graph.nodes[1].id, id);
  graph.name = kind === 'hybrid' ? 'Kết hợp mô phỏng và phần cứng' : 'Phân phối khóa tin cậy';
  if (kind === 'hybrid') {
    graph.quantumPaths[0].provider = 'thorlabs';
    graph.quantumPaths[0].providerConfig = {};
    graph.qkdSessions[0].config.sequenceLength = 32;
  }
  return graph;
}
