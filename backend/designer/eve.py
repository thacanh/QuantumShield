"""Receiver-side optical observations. Eve never replaces transmitted states."""
import json

import torch

from .ideal import EveObservation, bit_stream, derive_seed, measure

if __package__.startswith('backend.'):
    from backend.model import Gen_Eve, binary_entropy, decode_threshold, gaussian_overlap
else:
    from model import Gen_Eve, binary_entropy, decode_threshold, gaussian_overlap

ESTIMATOR_VERSION = 'binary_entropy_detected_sifted_sum_cap_v2'


def observation_streams(states, session, path):
    if path.provider != 'simulation' or not path.viaEveId:
        raise ValueError('UNSUPPORTED_EVE_PATH')
    entity = json.dumps([path.id, path.viaEveId], ensure_ascii=False, separators=(',', ':'))
    bases = bit_stream(session.config.masterSeed, session.id, 'eve_bases', entity, len(states.bits))
    namespace = json.dumps([session.id, 'eve_observation', entity], ensure_ascii=False, separators=(',', ':'))
    generator = torch.Generator(device='cpu').manual_seed(derive_seed(session.config.masterSeed, namespace) & ((1 << 64) - 1))
    return entity, bases, generator


def observation(path, bits, bases):
    return EveObservation(path.viaEveId, path.id, tuple(bits), tuple(bases), path.target,
                          path.eveOffsetMeters, gaussian_overlap(path.eveOffsetMeters))


def observe_ideal(states, session, path):
    """Ideal surrogate: Gaussian overlap controls independent Eve detection.

    This is not the measured FSO analogue channel. The legitimate receiver stays
    ideal; the offset changes Eve's optical collection probability only.
    """
    entity, bases, generator = observation_streams(states, session, path)
    mismatch = bit_stream(session.config.masterSeed, session.id, 'eve_mismatch', entity, len(states.bits))
    bits = measure(states, bases, mismatch).bits
    detected = torch.rand(len(bits), generator=generator) < gaussian_overlap(path.eveOffsetMeters)
    return observation(path, (b if found else -1 for b, found in zip(bits, detected.tolist())), bases)


def observe_fso(states, session, path, channel, power, rho):
    _, bases, generator = observation_streams(states, session, path)
    with torch.inference_mode():
        signal, amplitude = Gen_Eve(channel, path.eveOffsetMeters, torch.tensor(states.bits),
                                    torch.tensor(states.bases), 'cpu', power,
                                    generator=generator, measurement_bases=torch.tensor(bases))
        bits = (int(b) for b in decode_threshold(signal, amplitude, rho).tolist())
        return observation(path, bits, bases)


def estimate_information(reference, keep, measurements):
    if len(reference) != len(keep):
        raise ValueError('MISALIGNED_EVE_TRACE')
    count, reports = sum(keep), []
    for measurement in measurements:
        eve = measurement.eve
        if eve is None:
            continue
        if len(eve.bits) != len(reference) or len(eve.bases) != len(reference):
            raise ValueError('MISALIGNED_EVE_TRACE')
        observed = [(bit, ref) for bit, ref, retained in zip(eve.bits, reference, keep) if retained and bit != -1]
        detected = len(observed)
        errors = sum(bit != ref for bit, ref in observed)
        peve = min(errors/detected, 1-errors/detected) if detected else None
        information = detected * (1 - binary_entropy(peve)) if detected else 0.0
        reports.append(dict(pathId=eve.path_id, eveId=eve.eve_id, receiverId=eve.receiver_id,
                            offsetMeters=eve.offset_meters, gaussianOverlap=eve.overlap,
                            sampleCount=count, detectedCount=detected, erasedCount=count-detected,
                            errorCount=errors, peve=peve, estimatedInformationBits=information))
    return dict(model='receiver_side_fso' if reports else 'none', estimatorVersion=ESTIMATOR_VERSION,
                interpretation='educational_heuristic_not_security_bound',
                estimatedInformationBits=min(float(count), sum(r['estimatedInformationBits'] for r in reports)), paths=reports)
