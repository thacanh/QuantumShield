import copy
import hashlib
import json
import time
import uuid
from collections import OrderedDict
from threading import Lock

from .ideal import SEED_VERSION, run_session
from .protocol import compile_protocol
from .schemas import ExperimentInput
from .security import SharedKeyRegistry, distill
from .application import transmit_data


class ExperimentStore:
    def __init__(self, capacity=32, ttl=1800, clock=time.monotonic):
        self.capacity, self.ttl, self.clock = capacity, ttl, clock
        self.entries, self.lock = OrderedDict(), Lock()

    def _expire(self):
        now = self.clock()
        for id in [id for id, (deadline, _) in self.entries.items() if deadline <= now]:
            del self.entries[id]

    def put(self, result):
        with self.lock:
            self._expire()
            self.entries[result['id']] = (self.clock() + self.ttl, copy.deepcopy(result))
            while len(self.entries) > self.capacity:
                self.entries.popitem(last=False)

    def get(self, id):
        with self.lock:
            self._expire()
            entry = self.entries.get(id)
            return copy.deepcopy(entry[1]) if entry else None


store = ExperimentStore()


def acquisition_issues(graph, scope='ideal_acquisition'):
    issues = []
    if not graph.qkdSessions and not (scope in ('ideal_qkd', 'software_qkd', 'qkd') and graph.edges and all(e.config.protection == 'none' for e in graph.edges)):
        issues.append(dict(code='NO_QKD_SESSION', entityId=None))
    if sum(s.config.sequenceLength for s in graph.qkdSessions) > 262144:
        issues.append(dict(code='EXPERIMENT_STATE_LIMIT', entityId=None))
    for path in graph.quantumPaths:
        if path.provider == 'thorlabs' and scope in ('acquisition', 'qkd'):
            session = next(s for s in graph.qkdSessions if s.id == path.sessionId)
            if session.config.sequenceLength > 64:
                issues.append(dict(code='HARDWARE_SEQUENCE_LIMIT_64', entityId=path.id))
        elif path.provider != 'simulation' or path.providerConfig.get('model') not in (('ideal', 'current_fso') if not scope.startswith('ideal_') else ('ideal',)):
            issues.append(dict(code='UNSUPPORTED_EXECUTION_PROVIDER', entityId=path.id))
        if path.viaEveId and path.provider == 'thorlabs':
            issues.append(dict(code='UNSUPPORTED_PHYSICAL_EVE', entityId=path.id))
        elif path.viaEveId and scope not in ('acquisition', 'qkd'):
            issues.append(dict(code='EVE_EXECUTION_NOT_AVAILABLE', entityId=path.id))
    lengths = {s.id: s.config.sequenceLength for s in graph.qkdSessions}
    if sum(lengths[p.sessionId] for p in graph.quantumPaths if p.provider == 'thorlabs') > 1024:
        issues.append(dict(code='HARDWARE_TASK_LIMIT_1024', entityId=None))
    return issues


def run_experiment(graph, scope='ideal_acquisition', experiment_input=None):
    # Defend the service boundary as well as the HTTP preflight.
    if scope not in ('ideal_acquisition', 'ideal_qkd', 'software_acquisition', 'software_qkd', 'acquisition', 'qkd') or acquisition_issues(graph, scope):
        raise ValueError('UNSUPPORTED_IDEAL_ACQUISITION')
    if any(p.provider == 'thorlabs' for p in graph.quantumPaths):
        from .hardware import hardware_store
        return hardware_store.create(graph, scope, experiment_input or ExperimentInput())
    return complete_experiment(graph, scope, experiment_input)


def complete_experiment(graph, scope, experiment_input=None, *, experiment_id=None, acquisitions=None):
    snapshot = graph.model_dump(by_alias=True, exclude_none=True)
    experiment_id = experiment_id or str(uuid.uuid4())
    registry = SharedKeyRegistry(experiment_id)
    sessions = []
    for session in graph.qkdSessions:
        protocol = compile_protocol(graph, session)
        acquisition = acquisitions.get(session.id) if acquisitions else None
        if scope in ('ideal_qkd', 'software_qkd', 'qkd'):
            sessions.append(run_session(graph, session, protocol, acquisition=acquisition, postprocess=lambda result, a, b: distill(result, a, b, session, registry)))
        else:
            sessions.append(run_session(graph, session, protocol, acquisition=acquisition))
    result = dict(id=experiment_id, scope=scope, seedAlgorithm=SEED_VERSION,
                  state='aborted' if sessions and all((s['qkdStatus'] if scope in ('ideal_qkd', 'software_qkd', 'qkd') else s['acquisitionStatus']) == 'aborted' for s in sessions) else 'completed',
                  graphSnapshot=snapshot, graphFingerprint=hashlib.sha256(json.dumps(snapshot, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
                  sessions=sessions)
    if scope in ('ideal_qkd', 'software_qkd', 'qkd'):
        result['dataResults'] = transmit_data(graph, sessions, registry, (experiment_input or ExperimentInput()).dataInputs)
        if result['state'] != 'aborted' and any(d['applicationStatus'] == 'failed' for d in result['dataResults']):
            result['state'] = 'failed'
    public_snapshot = copy.deepcopy(result)
    for item in public_snapshot.get('dataResults', []):
        for field in ('ciphertext', 'nonce', 'authenticationTag', 'decryptedPayload', 'receivedPayload'):
            item.pop(field, None)
    if acquisitions is None:
        store.put(public_snapshot)
    return result
