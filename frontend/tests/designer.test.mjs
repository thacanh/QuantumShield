import test from 'node:test';
import assert from 'node:assert/strict';
import { systemTemplate, addDataLink, addSession, attachEve, eveConnectionPaths, compatibleSessions, designWarnings, directTemplate, makeId, removeEntity } from '../src/features/designer/system/graph.ts';
import { exportDesign, importDesign, sanitizeGraphForPersistence } from '../src/features/designer/system/persistence.ts';

function trusted() {
  const graph = directTemplate();
  graph.quantumPaths = [];
  graph.qkdSessions = [];
  const id = makeId();
  graph.nodes.push({ id, name: 'Charlie', type: 'key_distributor', position: { x: 250, y: 0 }, config: {} });
  return addSession(graph, 'trusted_distributor', graph.nodes[0].id, graph.nodes[1].id, id);
}

test('Eve wires from either side attach one whole path without changing session, provider or original graph', () => {
  const graph = systemTemplate('eve');
  const eve = graph.nodes.find(n => n.type === 'eavesdropper').id;
  delete graph.quantumPaths[0].viaEveId;
  const path = graph.quantumPaths[0];
  const before = structuredClone(graph);
  for (const [source, target] of [[path.target, eve], [eve, path.target]]) {
    const choice = eveConnectionPaths(graph, source, target);
    assert.equal(choice.eveId, eve);
    assert.deepEqual(choice.paths, [path]);
    const next = attachEve(graph, choice.paths[0].id, choice.eveId);
    assert.deepEqual(next.quantumPaths, [{ ...path, viaEveId: eve }]);
    assert.equal(next.qkdSessions, graph.qkdSessions);
    assert.equal(next.edges, graph.edges);
    assert.equal(next.quantumPaths[0].providerConfig, path.providerConfig);
    assert.equal(attachEve(next, path.id, eve), next);
    assert.deepEqual(importDesign(exportDesign(next)), next);
  }
  assert.deepEqual(graph, before);
});

test('Eve attaches only to incoming receiver links and rejects Charlie transmitter', () => {
  const graph = trusted();
  const eve = makeId();
  graph.nodes.push({ id: eve, name: 'Eve', type: 'eavesdropper', position: { x: 0, y: 0 }, config: {} });
  const [a, b] = graph.quantumPaths;
  assert.throws(() => eveConnectionPaths(graph, a.source, eve), /đầu thu/);
  assert.deepEqual(eveConnectionPaths(graph, eve, b.target).paths, [b]);
  const next = attachEve(graph, b.id, eve);
  assert.equal(next.quantumPaths[0], a);
  assert.equal(next.quantumPaths[1].viaEveId, eve);
  assert.deepEqual(eveConnectionPaths(graph, a.target, eve).paths, [a]);
  assert.equal(eveConnectionPaths(graph, a.source, a.target), null);
  assert.throws(() => eveConnectionPaths(graph, eve, eve), /Eve khác/);
  assert.throws(() => eveConnectionPaths(graph, eve, a.source), /đầu thu/i);
});

test('Eve attachment rejects hardware, invalid references and replacing another Eve', () => {
  const graph = systemTemplate('eve');
  const path = graph.quantumPaths[0];
  const other = makeId();
  graph.nodes.push({ id: other, name: 'Eve 2', type: 'eavesdropper', position: { x: 0, y: 0 }, config: {} });
  assert.throws(() => attachEve(graph, path.id, other), /Eve khác/);
  assert.throws(() => attachEve(graph, 'missing', other), /Không tìm thấy/);
  assert.throws(() => attachEve(graph, path.id, path.source), /Không tìm thấy/);
  delete path.viaEveId;
  path.provider = 'thorlabs';
  const before = structuredClone(graph);
  assert.throws(() => attachEve(graph, path.id, other), /UNSUPPORTED_PHYSICAL_EVE/);
  assert.deepEqual(graph, before);
});

test('direct and trusted designs round-trip; two trusted paths reference one session', () => {
  for (const graph of [directTemplate(), trusted()]) assert.deepEqual(importDesign(exportDesign(graph)), graph);
  const g = trusted();
  assert.equal(g.qkdSessions.length, 1);
  assert.equal(g.quantumPaths.length, 2);
  assert.ok(g.quantumPaths.every(p => p.sessionId === g.qkdSessions[0].id));
});

test('sanitizer removes secrets at every object/config boundary without mutating input', () => {
  const g = trusted();
  const forbidden = { payload: 'secret-payload', fileContent: 'secret-file', keyBits: [1, 1], finalKey: 'secret-final', ciphertext: 'secret-cipher', hardwareMeasurements: ['secret-hw'] };
  Object.assign(g, forbidden, { experimentResult: forbidden });
  for (const collection of [g.nodes, g.edges, g.quantumPaths, g.qkdSessions]) {
    for (const item of collection) {
      Object.assign(item, forbidden);
      Object.assign(item.config ?? item.providerConfig, forbidden, { nested: forbidden });
    }
  }
  const clean = exportDesign(g);
  for (const key of Object.keys(forbidden)) assert.equal(clean.includes(`"${key}"`), false, key);
  assert.equal(clean.includes('secret-'), false);
  assert.equal(clean.includes('nested'), false);
  assert.equal(g.payload, 'secret-payload');
  assert.equal(importDesign(clean).quantumPaths.length, 2);
});

test('provider configuration stays on one path through Eve; physical Eve rejected', () => {
  const g = directTemplate();
  const eve = { id: makeId(), type: 'eavesdropper', name: 'Eve', position: { x: 250, y: 250 }, config: {} };
  g.nodes.push(eve);
  g.quantumPaths[0].viaEveId = eve.id;
  const restored = importDesign(exportDesign(g));
  assert.equal(restored.quantumPaths.length, 1);
  assert.equal(restored.quantumPaths[0].viaEveId, eve.id);
  g.quantumPaths[0].provider = 'thorlabs';
  g.quantumPaths[0].providerConfig = {};
  assert.throws(() => sanitizeGraphForPersistence(g), /UNSUPPORTED_PHYSICAL_EVE/);
});

test('all four trusted provider combinations preserve session and independent per-path config', () => {
  for (const a of ['simulation', 'thorlabs']) for (const b of ['simulation', 'thorlabs']) {
    const g = trusted();
    [a, b].forEach((provider, i) => { g.quantumPaths[i].provider = provider; g.quantumPaths[i].providerConfig = provider === 'simulation' ? { model: 'ideal' } : {}; });
    assert.deepEqual(importDesign(exportDesign(g)), g);
  }
});

test('import rejects bad schema, duplicate IDs, unknown nodes and broken sessions', () => {
  const cases = [
    g => { g.version = 2; },
    g => { g.nodes[1].id = g.nodes[0].id; },
    g => { g.nodes[0].type = 'alice'; },
    g => { g.quantumPaths[0].source = 'missing'; },
    g => { g.qkdSessions[0].pathIds = []; },
    g => { g.quantumPaths[0].sessionId = 'missing'; },
    g => { g.quantumPaths[0].viaEveId = g.nodes[0].id; },
    g => { g.edges[0].target = g.edges[0].source; },
    g => { g.qkdSessions[0].config.masterSeed = 1.5; },
    g => { g.nodes[0].position.x = Infinity; },
    g => { g.qkdSessions[0].config.sequenceLength = 1000000; },
  ];
  for (const mutate of cases) { const g = directTemplate(); mutate(g); assert.throws(() => sanitizeGraphForPersistence(g), /INVALID_SYSTEM_GRAPH/); }
  assert.throws(() => importDesign('not json'));
  assert.throws(() => importDesign(JSON.stringify({ schema: 'other', version: 1, graph: directTemplate() })), /INVALID_SYSTEM_GRAPH/);
  assert.throws(() => importDesign(' '.repeat(2_000_001)), /2 MB/);
});

test('FSO fields are validated and masterSeed is the only persisted seed source', () => {
  const g = directTemplate();
  g.quantumPaths[0].providerConfig = { model: 'current_fso', dataset: 'lightrain.csv', windowStart: 12, Pt_dBm: 4.5, xi: 60, thresholdMode: 'fixed', fixedRho: 0.5, seed: 999 };
  const clean = importDesign(exportDesign(g));
  assert.equal(clean.quantumPaths[0].providerConfig.seed, undefined);
  assert.equal(clean.quantumPaths[0].providerConfig.Pt_dBm, 4.5);
  g.quantumPaths[0].providerConfig.dataset = '../secret.csv';
  assert.throws(() => sanitizeGraphForPersistence(g), /dataset/);
});

test('deletion is explicit and complete; stale DATA key source remains visible as a warning', () => {
  const g = trusted();
  g.edges[0].config.keySource = g.qkdSessions[0].id;
  const next = removeEntity(g, { kind: 'path', id: g.quantumPaths[0].id });
  assert.equal(next.qkdSessions.length, 0);
  assert.equal(next.quantumPaths.length, 0);
  assert.equal(next.edges.length, 1);
  assert.match(designWarnings(next)[0], /NO_QKD_PATH/);
  assert.deepEqual(importDesign(exportDesign(next)), next);
  const deletedNode = removeEntity(g, { kind: 'node', id: g.nodes[0].id });
  assert.equal(deletedNode.edges.length, 0);
  assert.equal(deletedNode.quantumPaths.length, 0);
  assert.equal(g.quantumPaths.length, 2, 'previous graph is intact for undo');
});

test('ambiguous keys are surfaced; unprotected DATA does not require QKD', () => {
  let g = directTemplate();
  const [a, b] = g.nodes.map(n => n.id);
  g = addSession(g, 'direct_bb84', a, b);
  assert.equal(compatibleSessions(g, a, b).length, 2);
  assert.match(designWarnings(g)[0], /AMBIGUOUS_KEY_SOURCE/);
  g.edges[0].config.keySource = g.qkdSessions[0].id;
  assert.deepEqual(designWarnings(g), []);
  g.edges[0].config.protection = 'none'; g.qkdSessions = []; g.quantumPaths = [];
  assert.deepEqual(designWarnings(g), []);
});

test('reject self and nonparticipant connections; rename preserves all identities and seeds', () => {
  const g = trusted();
  const [a, b, c] = g.nodes.map(n => n.id);
  assert.throws(() => addDataLink(g, a, a));
  assert.throws(() => addDataLink(g, c, b));
  assert.throws(() => addSession(g, 'direct_bb84', c, b));
  assert.throws(() => addSession(g, 'trusted_distributor', a, b, a));
  const sessions = structuredClone(g.qkdSessions);
  g.nodes[0].name = 'Bank A';
  assert.deepEqual(importDesign(exportDesign(g)).qkdSessions, sessions);
});
import { readFileSync } from 'node:fs';
import { designerApiBase } from '../src/api/designerUrl.ts';

test('designer API supports legacy full simulate URLs and proxy prefixes', () => {
  for (const suffix of ['', '/', '/simulate', '/api/simulate/', '/v1/simulate']) {
    assert.equal(designerApiBase(`http://localhost:8000${suffix}`), 'http://localhost:8000/v1/designer');
  }
  assert.equal(designerApiBase(' https://example.test/proxy/v1/simulate/ '), 'https://example.test/proxy/v1/designer');
});

test('shared backend fixtures remain valid frontend design documents', () => {
  const fixtures = JSON.parse(readFileSync(new URL('../../backend/fixtures/designer.json', import.meta.url), 'utf8'));
  for (const graph of fixtures) assert.deepEqual(sanitizeGraphForPersistence(graph), graph);
});


test('all four built-in templates round-trip with valid protocol/provider references', () => {
  for (const kind of ['direct', 'trusted', 'hybrid', 'eve']) {
    const graph = systemTemplate(kind);
    assert.deepEqual(importDesign(exportDesign(graph)), graph);
    assert.equal(graph.qkdSessions.length, 1);
    assert.equal(graph.edges.length, 1);
    assert.equal(designWarnings(graph).length, 0);
    if (kind === 'hybrid') {
      assert.equal(graph.qkdSessions[0].config.sequenceLength, 32);
      assert.deepEqual(graph.quantumPaths.map(p => p.provider), ['thorlabs', 'simulation']);
    }
    if (kind === 'eve') assert.equal(graph.nodes.find(n => n.id === graph.quantumPaths[0].viaEveId).type, 'eavesdropper');
    assert.notEqual(graph.id, systemTemplate(kind).id);
  }
});

const { comparisonSnapshot } = await import('../src/features/designer/experiment/comparison.ts');
test('comparison whitelist excludes payload/key/trace and stays immutable across editor/run changes', () => {
  const graph = systemTemplate('eve');
  const id = graph.qkdSessions[0].id;
  const result = { id: 'run', state: 'aborted', scope: 'qkd', graphSnapshot: graph,
    sessions: [{ sessionId: id, protocol: 'direct_bb84', siftedCount: 99, siftRatio: .5, qber: .25,
      estimated_eve_information_bits: 20, finalKeyLength: 0, qkdStatus: 'aborted', keyStatus: 'none',
      preview: [{ preparedBit: 1, secret: 'secret-trace' }], sharedKeyHandle: 'secret-handle', reconciliation: null }],
    dataResults: [{ edgeId: graph.edges[0].id, protection: 'aes_256_gcm', applicationStatus: 'failed', transmissionStatus: 'blocked',
      decryptedPayload: 'secret-payload', ciphertext: 'secret-cipher' }] };
  const snapshot = comparisonSnapshot(result);
  const saved = JSON.stringify(snapshot);
  assert.equal(saved.includes('secret-'), false);
  assert.equal(saved.includes('preview'), false);
  assert.equal(snapshot.sessions[0].id, id);
  assert.match(snapshot.sessions[0].paths[0], /Alice → Bob.*Eve gần Bob/);
  assert.equal(snapshot.sessions[0].qber, .25);
  result.sessions[0].qber = .9;
  graph.nodes[0].name = 'Edited';
  assert.equal(JSON.stringify(snapshot), saved);
  for (const state of ['waiting_for_hardware', 'processing']) assert.equal(comparisonSnapshot({...result, state}), undefined);
  assert.equal(comparisonSnapshot({...result, sessions: []}), undefined);
});


test('Eve selects exact incoming path across sessions, including reverse direct QKD', () => {
  let graph = systemTemplate('eve');
  const path = graph.quantumPaths[0], eve = path.viaEveId;
  assert.deepEqual(eveConnectionPaths(graph, eve, path.source).paths, []);
  graph = addSession(graph, 'direct_bb84', path.source, path.target);
  assert.deepEqual(eveConnectionPaths(graph, eve, path.target).paths.map(p => p.id), graph.quantumPaths.map(p => p.id));
  graph = addSession(graph, 'direct_bb84', path.target, path.source);
  assert.deepEqual(eveConnectionPaths(graph, eve, path.source).paths, [graph.quantumPaths[2]]);
  assert.deepEqual(eveConnectionPaths(graph, path.source, eve).paths, [graph.quantumPaths[2]]);
});

test('offset persists per path with validation; deleting Eve preserves QKD and DATA', () => {
  const graph = systemTemplate('eve');
  const path = graph.quantumPaths[0];
  path.eveOffsetMeters = 12.5;
  assert.equal(importDesign(exportDesign(graph)).quantumPaths[0].eveOffsetMeters, 12.5);
  const removed = removeEntity(graph, { kind: 'node', id: path.viaEveId });
  assert.equal(removed.quantumPaths.length, 1);
  assert.equal(removed.quantumPaths[0].viaEveId, undefined);
  assert.equal(removed.quantumPaths[0].eveOffsetMeters, undefined);
  assert.deepEqual(removed.qkdSessions, graph.qkdSessions);
  assert.deepEqual(removed.edges, graph.edges);
  for (const value of [-1, 201, NaN, Infinity, null, '20']) {
    path.eveOffsetMeters = value;
    assert.throws(() => sanitizeGraphForPersistence(graph), /eveOffsetMeters/);
  }
  delete path.eveOffsetMeters;
  assert.equal(importDesign(exportDesign(graph)).quantumPaths[0].viaEveId, path.viaEveId);
});
