"""Canonical typed pipelines, derived from the validated design."""
from .schemas import SystemGraph

STAGES = [
    ("state_preparation", "State preparation"), ("quantum_transmission", "Quantum transmission"),
    ("measurement", "Measurement"), ("basis_reconciliation", "Basis reconciliation"),
    ("sifting", "Sifting"), ("qber_estimation", "QBER estimation"),
    ("error_correction", "Educational Cascade"), ("key_verification", "Key verification"),
    ("privacy_amplification", "Privacy amplification"), ("key_store", "Shared key store"),
]
LABELS = dict(STAGES)


def compile_protocol(graph: SystemGraph, session):
    nodes, edges = [], []
    names = {n.id: n.name for n in graph.nodes}

    def node(id, stage, inputs, outputs, x, y, actor=None, path=None):
        value = dict(id=id, stage=stage, label=LABELS[stage], inputs=inputs, outputs=outputs,
                     position=dict(x=x, y=y), actorId=actor, pathId=path,
                     actorName=names.get(actor))
        nodes.append(value)
        return value

    def link(source, source_port, target, target_port):
        edges.append(dict(id=f"edge:{len(edges)}", source=source['id'], sourcePort=source_port,
                          target=target['id'], targetPort=target_port, artifact=source['outputs'][source_port]))

    source = session.distributorId or session.participantIds[0]
    prep = node('prepare', 'state_preparation', {}, {'states': 'prepared_states'}, 240, 0, source)
    receivers = session.participantIds if session.protocol == 'trusted_distributor' else session.participantIds[1:]
    measurements = []
    for i, receiver in enumerate(receivers):
        path = next(p for p in graph.quantumPaths if p.sessionId == session.id and p.target == receiver)
        x = i * 480 if len(receivers) == 2 else 240
        tx = node(f'transmit:{i}', 'quantum_transmission', {'states': 'prepared_states'}, {'states': 'prepared_states'}, x, 180, source, path.id)
        tx['provider'] = path.provider
        tx['routeLabel'] = ' → '.join(names[id] for id in [source, receiver])
        if path.viaEveId:
            tx['attackModel'] = 'receiver_side_fso'
            tx['eveReceiverId'] = path.target
            tx['eveOffsetMeters'] = path.eveOffsetMeters
            tx['eveName'] = names[path.viaEveId]
        measurement = node(f'measure:{i}', 'measurement', {'states': 'prepared_states'}, {'measurements': 'raw_measurements'}, x, 360, receiver, path.id)
        link(prep, 'states', tx, 'states')
        link(tx, 'states', measurement, 'states')
        measurements.append(measurement)
    measurement_ports = {f'receiver:{i}': 'raw_measurements' for i in range(len(measurements))}
    basis = node('basis', 'basis_reconciliation', {'states': 'prepared_states', **measurement_ports}, {'basis': 'basis_metadata'}, 240, 540)
    sift = node('sift', 'sifting', {'states': 'prepared_states', 'basis': 'basis_metadata', **measurement_ports}, {'pair': 'sifted_key_pair'}, 240, 720)
    link(prep, 'states', basis, 'states')
    link(prep, 'states', sift, 'states')
    link(basis, 'basis', sift, 'basis')
    for i, measurement in enumerate(measurements):
        link(measurement, 'measurements', basis, f'receiver:{i}')
        link(measurement, 'measurements', sift, f'receiver:{i}')
    qber = node('qber', 'qber_estimation', {'pair': 'sifted_key_pair'}, {'report': 'qber_report'}, 240, 900)
    ec = node('correct', 'error_correction', {'pair': 'sifted_key_pair', 'report': 'qber_report'}, {'pair': 'corrected_key_pair'}, 240, 1080)
    verify = node('verify', 'key_verification', {'pair': 'corrected_key_pair'}, {'pair': 'verified_key_pair'}, 240, 1260)
    pa = node('amplify', 'privacy_amplification', {'pair': 'verified_key_pair', 'report': 'qber_report'}, {'pair': 'secure_key_pair'}, 240, 1440)
    registry = node('store', 'key_store', {'pair': 'secure_key_pair'}, {'handle': 'shared_key_handle'}, 240, 1620)
    for src, sp, dst, dp in [(sift, 'pair', qber, 'pair'), (sift, 'pair', ec, 'pair'),
                             (qber, 'report', ec, 'report'), (ec, 'pair', verify, 'pair'),
                             (verify, 'pair', pa, 'pair'), (qber, 'report', pa, 'report'), (pa, 'pair', registry, 'pair')]:
        link(src, sp, dst, dp)
    result = dict(version=1, sessionId=session.id, protocol=session.protocol, nodes=nodes, edges=edges)
    validate_protocol(result)
    return result


def validate_protocol(graph):
    """Reject malformed typed wiring, missing stages/inputs and cycles; never repair."""
    def fail():
        raise ValueError('INVALID_PROTOCOL_GRAPH')
    nodes = {n['id']: n for n in graph['nodes']}
    if len(nodes) != len(graph['nodes']) or set(n['stage'] for n in nodes.values()) != set(LABELS):
        fail()
    if sum(n['stage'] == 'state_preparation' for n in nodes.values()) != 1:
        fail()
    receiver_count = 2 if graph['protocol'] == 'trusted_distributor' else 1
    if graph['protocol'] not in ('direct_bb84', 'trusted_distributor'):
        fail()
    receiver_ports = {f'receiver:{i}': 'raw_measurements' for i in range(receiver_count)}
    signatures = {
        'state_preparation': ({}, {'states': 'prepared_states'}),
        'quantum_transmission': ({'states': 'prepared_states'}, {'states': 'prepared_states'}),
        'measurement': ({'states': 'prepared_states'}, {'measurements': 'raw_measurements'}),
        'basis_reconciliation': ({'states': 'prepared_states', **receiver_ports}, {'basis': 'basis_metadata'}),
        'sifting': ({'states': 'prepared_states', 'basis': 'basis_metadata', **receiver_ports}, {'pair': 'sifted_key_pair'}),
        'qber_estimation': ({'pair': 'sifted_key_pair'}, {'report': 'qber_report'}),
        'error_correction': ({'pair': 'sifted_key_pair', 'report': 'qber_report'}, {'pair': 'corrected_key_pair'}),
        'key_verification': ({'pair': 'corrected_key_pair'}, {'pair': 'verified_key_pair'}),
        'privacy_amplification': ({'pair': 'verified_key_pair', 'report': 'qber_report'}, {'pair': 'secure_key_pair'}),
        'key_store': ({'pair': 'secure_key_pair'}, {'handle': 'shared_key_handle'}),
    }
    for stage in LABELS:
        group = [n for n in nodes.values() if n['stage'] == stage]
        expected = receiver_count if stage in ('measurement', 'quantum_transmission') else 1
        if len(group) != expected or any((n['inputs'], n['outputs']) != signatures[stage] for n in group):
            fail()
    seen, incoming, adjacency = set(), set(), {id: [] for id in nodes}
    for edge in graph['edges']:
        src, dst = nodes.get(edge['source']), nodes.get(edge['target'])
        target_port = (edge['target'], edge['targetPort'])
        if (edge['id'] in seen or not src or not dst or target_port in incoming
                or edge['sourcePort'] not in src['outputs'] or edge['targetPort'] not in dst['inputs']
                or src['outputs'][edge['sourcePort']] != edge['artifact']
                or dst['inputs'][edge['targetPort']] != edge['artifact']):
            fail()
        seen.add(edge['id'])
        incoming.add(target_port)
        adjacency[src['id']].append(dst['id'])
    if incoming != {(id, port) for id, n in nodes.items() for port in n['inputs']}:
        fail()
    visiting, visited = set(), set()
    def visit(id):
        if id in visiting:
            fail()
        if id in visited:
            return
        visiting.add(id)
        for child in adjacency[id]:
            visit(child)
        visiting.remove(id)
        visited.add(id)
    for id in nodes:
        visit(id)
