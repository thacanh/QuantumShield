"""Deterministic educational ideal measurement; never substituted for hardware."""
import hashlib
import json
from dataclasses import dataclass, replace

import torch

if __package__.startswith('backend.'):
    from backend.model import compute_QBER_AB
else:
    from model import compute_QBER_AB

SEED_VERSION = 'sha256-shake256-v1'


def derive_seed(master_seed: int, namespace: str) -> int:
    data = b'QuantumShield.seed.v1\0' + master_seed.to_bytes(4, 'big') + namespace.encode('utf-8')
    return int.from_bytes(hashlib.sha256(data).digest(), 'big')


def bit_stream(master_seed, session_id, stream, entity_id, length):
    namespace = json.dumps([session_id, stream, entity_id], ensure_ascii=False, separators=(',', ':'))
    seed = derive_seed(master_seed, namespace).to_bytes(32, 'big')
    data = hashlib.shake_256(seed).digest((length + 7) // 8)
    return tuple((data[i // 8] >> (i % 8)) & 1 for i in range(length))


@dataclass(frozen=True)
class PreparedStates:
    bits: tuple[int, ...]
    bases: tuple[int, ...]


@dataclass(frozen=True)
class EveObservation:
    eve_id: str
    path_id: str
    bits: tuple[int, ...]
    bases: tuple[int, ...]
    receiver_id: str = ''
    offset_meters: float = 100
    overlap: float = 0


@dataclass(frozen=True)
class RawMeasurements:
    bits: tuple[int, ...]
    bases: tuple[int, ...]
    origin: str = 'SIM'
    eve: EveObservation | None = None


def measure(states: PreparedStates, bases, mismatch_bits) -> RawMeasurements:
    if not len(states.bits) == len(states.bases) == len(bases) == len(mismatch_bits):
        raise ValueError('MISALIGNED_MEASUREMENTS')
    return RawMeasurements(tuple(bit if basis == prepared_basis else mismatch
                                 for bit, prepared_basis, basis, mismatch in zip(states.bits, states.bases, bases, mismatch_bits)), tuple(bases))


def sift_and_qber(states, measurements, trusted):
    count = len(states.bits)
    if len(measurements) != (2 if trusted else 1) or any(len(m.bits) != count or len(m.bases) != count for m in measurements):
        raise ValueError('MISALIGNED_MEASUREMENTS')
    keep = tuple(all(m.bits[i] != -1 and m.bases[i] == states.bases[i] for m in measurements) for i in range(count))
    left = measurements[0].bits if trusted else states.bits
    right = measurements[-1].bits
    n = sum(keep)
    mismatches = sum(a != b for a, b, retained in zip(left, right, keep) if retained)
    if not n:
        return keep, n, mismatches, None
    a = torch.tensor([bit if retained else -1 for bit, retained in zip(left, keep)])
    b = torch.tensor([bit if retained else -1 for bit, retained in zip(right, keep)])
    qber, _ = compute_QBER_AB(a, b)
    return keep, n, mismatches, qber


def prepare_session(session):
    length, seed = session.config.sequenceLength, session.config.masterSeed
    source = session.distributorId or session.participantIds[0]
    states = PreparedStates(bit_stream(seed, session.id, 'state_bits', source, length),
                            bit_stream(seed, session.id, 'state_bases', source, length))
    return states


def acquire_path(states, session, path):
    length, seed = session.config.sequenceLength, session.config.masterSeed
    bases = bit_stream(seed, session.id, 'receiver_bases', path.target, length)
    metadata = {}
    model = path.providerConfig.get('model')
    if path.provider != 'simulation':
        raise ValueError('HARDWARE_OBSERVATION_REQUIRED')
    if model == 'current_fso':
        from .fso import measure_fso
        measurement, metadata = measure_fso(states, bases, session, path)
    else:
        mismatch = bit_stream(seed, session.id, 'basis_mismatch', path.id, length)
        measurement = measure(states, bases, mismatch)
        if path.viaEveId:
            from .eve import observe_ideal
            measurement = replace(measurement, eve=observe_ideal(states, session, path))
    return measurement, path_summary(path, measurement, metadata)


def path_summary(path, measurement, metadata=None):
    length = len(measurement.bits)
    erased = measurement.bits.count(-1)
    return dict(pathId=path.id, model='manual' if path.provider == 'thorlabs' else path.providerConfig.get('model'),
                origin=measurement.origin, measuredCount=length, detectedCount=length-erased, erasedCount=erased, **(metadata or {}))


def run_session(graph, session, protocol, *, postprocess=None, acquisition=None):
    length = session.config.sequenceLength
    states = acquisition[0] if acquisition else prepare_session(session)
    trusted = session.protocol == 'trusted_distributor'
    receivers = session.participantIds if trusted else session.participantIds[1:]
    measurements, path_results = [], []
    for index, receiver in enumerate(receivers):
        path = next(p for p in graph.quantumPaths if p.sessionId == session.id and p.target == receiver)
        if acquisition:
            measurement, metadata = acquisition[1][index], acquisition[2][index]
        else:
            measurement, metadata = acquire_path(states, session, path)
        measurements.append(measurement)
        path_results.append(metadata)
    keep, sifted, errors, qber = sift_and_qber(states, measurements, trusted)
    from .eve import estimate_information
    reference = measurements[0].bits if trusted else states.bits
    eve_report = estimate_information(reference, keep, measurements)
    reason = 'ZERO_SIFTED_BITS' if not sifted else 'QBER_ABOVE_11_PERCENT' if qber >= session.config.qberAbortThreshold else None
    stage_results = []
    for node in protocol['nodes']:
        stage = node['stage']
        done = stage in {'state_preparation', 'quantum_transmission', 'measurement', 'basis_reconciliation', 'sifting', 'qber_estimation'}
        input_count = 0 if stage == 'state_preparation' else sifted if stage == 'qber_estimation' else length
        output_count = 1 if stage == 'qber_estimation' else sifted if stage == 'sifting' else length
        stage_results.append(dict(nodeId=node['id'], status=('aborted' if reason and stage == 'qber_estimation' else 'completed') if done else 'not_run',
                                  inputCount=input_count if done else None, outputCount=output_count if done else None))
    preview = [dict(index=i, preparedBit=states.bits[i], preparedBasis='X' if states.bases[i] else 'Z', kept=keep[i],
                    measurements=[dict(nodeId=receiver, bit=m.bits[i], basis='X' if m.bases[i] else 'Z', origin=m.origin)
                                  for receiver, m in zip(receivers, measurements)],
                    eve=[dict(eveId=m.eve.eve_id, pathId=m.eve.path_id, measuredBit=m.eve.bits[i],
                              receiverId=m.eve.receiver_id, basis='X' if m.eve.bases[i] else 'Z', origin='SIM')
                         for m in measurements if m.eve]) for i in range(min(64, length))]
    result = dict(sessionId=session.id, protocol=session.protocol, acquisitionStatus='aborted' if reason else 'completed',
                qkdStatus='aborted' if reason else None, keyStatus='none', applicationStatus='not_requested',
                completedThrough='qber_estimation', abortReason=reason, preparedCount=length, siftedCount=sifted,
                errorCount=errors, qber=qber, siftRatio=sifted / length, preview=preview, stages=stage_results,
                pathResults=path_results, eveReport=eve_report,
                estimated_eve_information_bits=eve_report['estimatedInformationBits'])
    if any(m.origin == 'HW' for m in measurements):
        result['preview'] = []
    if postprocess is not None:
        # Private key material leaves acquisition only through an internal callback.
        left = measurements[0].bits if trusted else states.bits
        right = measurements[-1].bits
        postprocess(result, [b for b, kept in zip(left, keep) if kept], [b for b, kept in zip(right, keep) if kept])
        result['preview'] = []
    return result
