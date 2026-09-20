"""Bounded, process-local manual acquisition. Never substitutes SIM for HW."""
import copy
import hashlib
import json
import time
import uuid
from threading import Lock

from .ideal import SEED_VERSION, RawMeasurements, acquire_path, bit_stream, path_summary, prepare_session


class HardwareError(ValueError):
    def __init__(self, code, status=409):
        super().__init__(code)
        self.code, self.status = code, status


class ManualRun:
    def __init__(self, graph, scope, experiment_input):
        self.id = str(uuid.uuid4())
        self.graph = graph.model_copy(deep=True)
        self.input = experiment_input.model_copy(deep=True)
        self.scope = scope
        self.acquisitions, self.tasks, self.observations, self.receipts = {}, [], {}, {}
        self.completed = 0
        for session in self.graph.qkdSessions:
            states = prepare_session(session)
            measurements, summaries = [], []
            receivers = session.participantIds if session.protocol == 'trusted_distributor' else session.participantIds[1:]
            for receiver in receivers:
                path = next(p for p in self.graph.quantumPaths if p.sessionId == session.id and p.target == receiver)
                if path.provider == 'simulation':
                    measurement, summary = acquire_path(states, session, path)
                else:
                    bases = bit_stream(session.config.masterSeed, session.id, 'receiver_bases', receiver, len(states.bits))
                    measurement, summary = RawMeasurements((), bases, 'HW'), None
                    self.observations[path.id] = []
                    for i in range(len(states.bits)):
                        self.tasks.append((str(uuid.uuid4()), session.id, path.id, receiver, len(measurements), i))
                measurements.append(measurement)
                summaries.append(summary)
            self.acquisitions[session.id] = (states, measurements, summaries)
        self.total = len(self.tasks)
        snapshot = self.graph.model_dump(by_alias=True, exclude_none=True)
        self.result = dict(id=self.id, scope=scope, state='waiting_for_hardware', seedAlgorithm=SEED_VERSION,
                           graphSnapshot=snapshot, graphFingerprint=hashlib.sha256(json.dumps(snapshot, sort_keys=True, ensure_ascii=False).encode()).hexdigest(), sessions=[])

    def snapshot(self):
        result = copy.deepcopy(self.result)
        result['progress'] = dict(completed=self.completed, total=self.total)
        result['currentTask'] = None
        if result['state'] == 'waiting_for_hardware':
            task, sid, pid, receiver, branch, index = self.tasks[self.completed]
            states, measurements, _ = self.acquisitions[sid]
            bit, basis, receiver_basis = states.bits[index], states.bases[index], measurements[branch].bases[index]
            result['currentTask'] = dict(taskId=task, experimentId=self.id, sessionId=sid, pathId=pid,
                roleNodeId=receiver, stateIndex=index, preparedBit=bit, preparedBasis='X' if basis else 'Z',
                measurementBasis='X' if receiver_basis else 'Z', status='pending',
                polarizationDeg=(45 if basis else 0) + 90*bit, analyzerDeg=45 if receiver_basis else 0)
        return result

    def clear_private(self):
        self.acquisitions.clear()
        self.observations.clear()
        self.tasks.clear()
        self.graph = self.input = None

    def submit(self, task_id, detector):
        # Completed retry is checked before current-task/lifecycle validation.
        if task_id in self.receipts:
            previous_detector, ack = self.receipts[task_id]
            if detector != previous_detector:
                raise HardwareError('TASK_ALREADY_COMPLETED')
            return copy.deepcopy(ack)
        if self.result.get('diagnostic') == 'HARDWARE_ACQUISITION_CANCELLED':
            raise HardwareError('HARDWARE_ACQUISITION_CANCELLED')
        if self.result['state'] != 'waiting_for_hardware' or self.tasks[self.completed][0] != task_id:
            raise HardwareError('STALE_ACQUISITION_TASK')
        _, sid, pid, _, branch, _ = self.tasks[self.completed]
        self.observations[pid].append(0 if detector == 'D0' else 1)
        self.completed += 1
        ack = dict(taskId=task_id, status='completed', completedCount=self.completed)
        if self.completed == self.total:
            self.result['state'] = 'processing'
            try:
                for session in self.graph.qkdSessions:
                    _, measurements, summaries = self.acquisitions[session.id]
                    receivers = session.participantIds if session.protocol == 'trusted_distributor' else session.participantIds[1:]
                    for index, receiver in enumerate(receivers):
                        path = next(p for p in self.graph.quantumPaths if p.sessionId == session.id and p.target == receiver)
                        if path.provider == 'thorlabs':
                            measurements[index] = RawMeasurements(tuple(self.observations[path.id]), measurements[index].bases, 'HW')
                            summaries[index] = path_summary(path, measurements[index])
                from .experiments import complete_experiment
                full_result = complete_experiment(self.graph, self.scope, self.input,
                    experiment_id=self.id, acquisitions=self.acquisitions)
                for session_result in full_result['sessions']:
                    session_result['preview'] = []
                self.result = copy.deepcopy(full_result)
                for item in self.result.get('dataResults', []):
                    for field in ('ciphertext', 'nonce', 'authenticationTag', 'decryptedPayload', 'receivedPayload'):
                        item.pop(field, None)
                full_result.update(progress=dict(completed=self.completed, total=self.total), currentTask=None)
                ack['result'] = full_result
            except Exception:
                # Do not rerun or expose private state if finalization fails.
                self.result.update(state='failed', diagnostic='HARDWARE_PROCESSING_FAILED', sessions=[])
                ack['result'] = self.snapshot()
            finally:
                self.clear_private()
        self.receipts[task_id] = (detector, copy.deepcopy(ack))
        return ack

    def cancel(self):
        if self.result['state'] == 'waiting_for_hardware':
            self.result.update(state='aborted', diagnostic='HARDWARE_ACQUISITION_CANCELLED')
            self.clear_private()
        return self.snapshot()


class HardwareStore:
    def __init__(self, capacity=8, ttl=1800, clock=time.monotonic):
        self.capacity, self.ttl, self.clock = capacity, ttl, clock
        self.entries, self.lock = {}, Lock()

    def _expire(self):
        for id in [id for id, (deadline, _) in self.entries.items() if deadline <= self.clock()]:
            del self.entries[id]

    def create(self, graph, scope, experiment_input):
        with self.lock:
            self._expire()
            if len(self.entries) >= self.capacity:
                raise HardwareError('HARDWARE_STORE_FULL', 429)
            run = ManualRun(graph, scope, experiment_input)
            self.entries[run.id] = (self.clock() + self.ttl, run)
            return run.snapshot()

    def _find(self, id):
        self._expire()
        if id not in self.entries:
            raise HardwareError('EXPERIMENT_NOT_FOUND_OR_EXPIRED', 404)
        return self.entries[id][1]

    def get(self, id):
        with self.lock:
            return self._find(id).snapshot()

    def submit(self, id, task_id, detector):
        if detector not in ('D0', 'D1'):
            raise HardwareError('INVALID_DETECTOR', 422)
        with self.lock:
            return self._find(id).submit(task_id, detector)

    def cancel(self, id):
        with self.lock:
            return self._find(id).cancel()


hardware_store = HardwareStore()
