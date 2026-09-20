"""Educational postprocessing; no authenticated/composable security claim."""
import hashlib
import json
import math
import uuid
from dataclasses import dataclass

import numpy as np

from .ideal import derive_seed

if __package__.startswith('backend.'):
    from backend.model import cascade_correct, generate_toeplitz_seed, privacy_amplification
else:
    from model import cascade_correct, generate_toeplitz_seed, privacy_amplification


@dataclass(frozen=True)
class SharedKey:
    handle: str
    participants: tuple[str, str]
    alice: tuple[int, ...]
    bob: tuple[int, ...]


class SharedKeyRegistry:
    """Private, run-local keys; never put this object in a public response/store."""
    def __init__(self, experiment_id):
        self.experiment_id = experiment_id
        self._keys = {}

    def register(self, session_id, participants, alice, bob):
        if not alice or alice != bob or any(b not in (0, 1) for b in alice) or len(set(participants)) != 2:
            raise ValueError('INVALID_SHARED_KEY')
        key = SharedKey(str(uuid.uuid4()), tuple(participants), tuple(alice), tuple(bob))
        self._keys[(session_id, tuple(sorted(participants)))] = key
        return key

    def resolve(self, experiment_id, session_id, participants):
        if experiment_id != self.experiment_id:
            return None
        return self._keys.get((session_id, tuple(sorted(participants))))


def distill(result, alice, bob, session, registry):
    estimate = result.get('estimated_eve_information_bits', 0)
    result.update(finalKeyLength=0, sharedKeyHandle=None, estimated_eve_information_bits=estimate,
                  reconciliation=None, verification=None,
                  securityModel='educational_receiver_side_fso' if result.get('eveReport', {}).get('paths') else 'educational_no_eve')
    if result['abortReason']:
        return
    source = session.distributorId or session.participantIds[0]
    def seed(stage):
        return derive_seed(session.config.masterSeed, json.dumps([session.id, stage, source], ensure_ascii=False, separators=(',', ':')))
    def stage(id, status, inputs, outputs):
        item = next(s for s in result['stages'] if s['nodeId'] == id)
        item.update(status=status, inputCount=inputs, outputCount=outputs)
    def abort(code, at):
        result.update(qkdStatus='aborted', keyStatus='none', abortReason=code)
        stage(at, 'aborted', len(alice), 0)
    metadata = {}
    try:
        corrected, leaked, success = cascade_correct(alice, bob, result['qber'], rng=np.random.default_rng(seed('cascade_shuffle')), metadata=metadata)
        result['reconciliation'] = dict(success=bool(success), leakedBits=int(leaked), fallbackUsed=metadata['fallbackUsed'])
        result['completedThrough'] = 'error_correction'
        if not success:
            abort('ERROR_CORRECTION_FAILED', 'correct')
            return
        stage('correct', 'completed', len(alice), len(corrected))
        result['verification'] = 'MATCH' if alice == corrected else 'MISMATCH'
        result['completedThrough'] = 'key_verification'
        if alice != corrected:
            abort('KEY_VERIFICATION_FAILED', 'verify')
            return
        stage('verify', 'completed', len(alice), len(alice))
    except Exception:
        abort('ERROR_CORRECTION_FAILED', 'correct')
        return
    length = max(0, math.floor(len(alice) - estimate - leaked - session.config.securityMarginBits))
    result['completedThrough'] = 'privacy_amplification'
    try:
        if length:
            seed_bytes = seed('toeplitz').to_bytes(32, 'big')
            public_seed = generate_toeplitz_seed(len(alice), length, random_bytes=lambda n: hashlib.shake_256(seed_bytes).digest(n))
            final_a = privacy_amplification(alice, length, public_seed)
            final_b = privacy_amplification(corrected, length, public_seed)
            if len(final_a) != length or final_a != final_b:
                abort('FINAL_KEYS_DO_NOT_MATCH', 'amplify')
                return
            key = registry.register(session.id, session.participantIds, final_a, final_b)
            result.update(sharedKeyHandle=key.handle, keyStatus='verified')
        stage('amplify', 'completed', len(alice), length)
        stage('store', 'completed', length, 1 if length else 0)
        result.update(finalKeyLength=length, qkdStatus='completed', completedThrough='key_store')
    except Exception:
        abort('PRIVACY_AMPLIFICATION_FAILED', 'amplify')
