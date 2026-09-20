import copy
import json
import unittest
from unittest.mock import patch

import numpy as np
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.model import cascade_correct, decrypt_message_aes_gcm, encrypt_message_aes_gcm, generate_toeplitz_seed
from backend.designer.experiments import run_experiment, store
from backend.designer.ideal import run_session
from backend.designer.protocol import compile_protocol
from backend.designer.router import router
from backend.designer.schemas import ExperimentInput, SystemGraph
from backend.designer.security import SharedKeyRegistry, distill
from backend.test_designer import direct, trusted


def full_graph(factory=direct, length=8192):
    raw = factory()
    raw['qkdSessions'][0]['config']['sequenceLength'] = length
    return SystemGraph.model_validate(raw)


def data_input(text='Giao dịch demo: 123 triệu đồng ✓', edge='d'):
    return ExperimentInput.model_validate({'dataInputs': [{'edgeId': edge, 'plaintext': text}]})


class SecurityTests(unittest.TestCase):
    def test_real_cascade_fallback_metadata_and_legacy_return(self):
        alice, bob = [0] * 8, [1, 1] + [0] * 6
        metadata = {}
        corrected, leakage, success = cascade_correct(alice, bob, 0.1, metadata=metadata)
        self.assertTrue(metadata['fallbackUsed'])
        self.assertEqual((corrected, leakage, success), (alice, 8, True))
        self.assertEqual(cascade_correct(alice, bob, 0.1), (corrected, leakage, success))
        cascade_correct(alice, alice, 0, metadata=metadata)
        self.assertFalse(metadata['fallbackUsed'])
        self.assertEqual(bob, [1, 1] + [0] * 6)

    def test_toeplitz_seed_uses_injected_bytes_and_preserves_random_default(self):
        with patch('backend.model.os.urandom', return_value=b'\xa5\x80') as random_bytes:
            expected = generate_toeplitz_seed(8, 3)
            random_bytes.assert_called_once_with(2)
        supplied = generate_toeplitz_seed(8, 3, random_bytes=lambda n: b'\xa5\x80')
        np.testing.assert_array_equal(expected, supplied)

    def test_direct_trusted_full_flow_and_no_key_material_in_public_result(self):
        for factory in (direct, trusted):
            result = run_experiment(full_graph(factory), 'ideal_qkd', data_input())
            session, data = result['sessions'][0], result['dataResults'][0]
            self.assertEqual((session['qkdStatus'], session['keyStatus']), ('completed', 'verified'))
            self.assertGreaterEqual(session['finalKeyLength'], 256)
            self.assertEqual(session['estimated_eve_information_bits'], 0)
            self.assertEqual(session['verification'], 'MATCH')
            self.assertEqual(session['preview'], [])
            self.assertTrue(all(s['status'] == 'completed' for s in session['stages']))
            self.assertEqual(data['applicationStatus'], 'encrypted')
            self.assertTrue(data['integrityVerified'])
            self.assertEqual(data['decryptedPayload'], data_input().dataInputs[0].plaintext)
            def check_keys(obj):
                if isinstance(obj, dict):
                    self.assertFalse(set(obj) & {'alice', 'bob', 'finalKey', 'siftedKey', 'correctedKey', 'keyBits', '_keys', 'plaintext'})
                    for value in obj.values():
                        check_keys(value)
                elif isinstance(obj, list):
                    for value in obj:
                        check_keys(value)
            check_keys(result)
            saved = json.dumps(store.get(result['id']), ensure_ascii=False)
            self.assertNotIn(data['decryptedPayload'], saved)
            self.assertNotIn('ciphertext', saved)
            self.assertNotIn('nonce', saved)

    def test_zero_short_and_exact_256_key_are_not_qkd_abort(self):
        for desired in (0, 7, 255, 256):
            graph = full_graph(length=2048)
            sifted = run_experiment(graph)['sessions'][0]['siftedCount']
            graph.qkdSessions[0].config.securityMarginBits = sifted - desired
            result = run_experiment(graph, 'ideal_qkd', data_input(''))
            session, data = result['sessions'][0], result['dataResults'][0]
            self.assertEqual(session['qkdStatus'], 'completed')
            self.assertIsNone(session['abortReason'])
            self.assertEqual(session['finalKeyLength'], desired)
            self.assertEqual(session['keyStatus'], 'verified' if desired else 'none')
            self.assertEqual(data['applicationStatus'], 'encrypted' if desired == 256 else 'insufficient_key')
            self.assertEqual(result['state'], 'completed')
            if desired == 256:
                self.assertEqual(data['decryptedPayload'], '')

    def test_registry_scope_pair_direction_and_no_previous_run_reuse(self):
        registry = SharedKeyRegistry('run1')
        bits = [0, 1] * 128
        registry.register('s', ['a', 'b'], bits, bits)
        self.assertIsNotNone(registry.resolve('run1', 's', ['b', 'a']))
        self.assertIsNone(registry.resolve('run2', 's', ['a', 'b']))
        self.assertIsNone(registry.resolve('run1', 'other', ['a', 'b']))
        self.assertIsNone(registry.resolve('run1', 's', ['a', 'c']))
        self.assertIsNone(SharedKeyRegistry('run2').resolve('run2', 's', ['a', 'b']))
        for bad in ([], [2], [0, 1]):
            with self.assertRaises(ValueError):
                registry.register('bad', ['a', 'b'], bad, [0])

    def test_repeatability_of_keys_but_random_aes_nonce(self):
        graph = full_graph()
        session = graph.qkdSessions[0]
        registries, reports = [], []
        for id in ('first', 'second'):
            registry = SharedKeyRegistry(id)
            report = run_session(graph, session, compile_protocol(graph, session), postprocess=lambda r, a, b: distill(r, a, b, session, registry))
            registries.append(registry)
            reports.append(report)
        self.assertEqual(registries[0].resolve('first', 's', ['a', 'b']).alice, registries[1].resolve('second', 's', ['a', 'b']).alice)
        for report in reports:
            report.pop('sharedKeyHandle')
        self.assertEqual(reports[0], reports[1])
        one = run_experiment(graph, 'ideal_qkd', data_input())['dataResults'][0]
        two = run_experiment(graph, 'ideal_qkd', data_input())['dataResults'][0]
        self.assertNotEqual(one['nonce'], two['nonce'])
        self.assertNotEqual(one['ciphertext'], two['ciphertext'])

    def test_reconciliation_verification_and_pa_fail_closed(self):
        graph = full_graph()
        def fail_ec(a, b, qber, **kwargs):
            kwargs['metadata']['fallbackUsed'] = False
            return b, 0, False
        def mismatch_ec(a, b, qber, **kwargs):
            kwargs['metadata']['fallbackUsed'] = False
            return [1 - b[0], *b[1:]], 0, True
        for helper, effect, code in [
            ('cascade_correct', fail_ec, 'ERROR_CORRECTION_FAILED'),
            ('cascade_correct', mismatch_ec, 'KEY_VERIFICATION_FAILED'),
            ('privacy_amplification', RuntimeError('private detail'), 'PRIVACY_AMPLIFICATION_FAILED'),
        ]:
            with patch('backend.designer.security.' + helper, side_effect=effect):
                result = run_experiment(graph, 'ideal_qkd', data_input())
            self.assertEqual(result['sessions'][0]['abortReason'], code)
            self.assertIsNone(result['sessions'][0]['sharedKeyHandle'])
            self.assertEqual(result['dataResults'][0]['diagnostic'], 'NO_VALID_SHARED_KEY')
            self.assertNotIn('private detail', str(result))
        different_bits = iter((0, 1))
        with patch('backend.designer.security.privacy_amplification', side_effect=lambda key, n, seed: [next(different_bits)] * n):
            result = run_experiment(graph, 'ideal_qkd')
            self.assertEqual(result['sessions'][0]['abortReason'], 'FINAL_KEYS_DO_NOT_MATCH')

    def test_aes_failure_does_not_abort_qkd_or_echo_plaintext(self):
        with patch('backend.designer.application.decrypt_message_aes_gcm', side_effect=ValueError('private material')):
            result = run_experiment(full_graph(), 'ideal_qkd', data_input())
        self.assertEqual(result['sessions'][0]['qkdStatus'], 'completed')
        self.assertEqual(result['sessions'][0]['applicationStatus'], 'failed')
        self.assertEqual(result['state'], 'failed')
        data = result['dataResults'][0]
        self.assertEqual(data['diagnostic'], 'AES_GCM_INTEGRITY_CHECK_FAILED')
        self.assertNotIn('decryptedPayload', data)
        self.assertNotIn('ciphertext', data)

    def test_real_aes_rejects_wrong_key_tag_and_aad(self):
        a, b = [0, 1] * 128, [1, 0] * 128
        cipher, nonce, tag = encrypt_message_aes_gcm('demo', a, 'context1')
        for key, auth_tag, aad in [(b, tag, 'context1'), (a, 'AA==' + tag[4:], 'context1'), (a, tag, 'context2')]:
            with self.assertRaises(Exception):
                decrypt_message_aes_gcm(cipher, nonce, auth_tag, key, aad)

    def test_no_payload_and_plaintext_only_are_explicit(self):
        result = run_experiment(full_graph(), 'ideal_qkd')
        self.assertEqual(result['dataResults'][0]['applicationStatus'], 'not_requested')
        self.assertTrue(result['dataResults'][0]['aesReady'])
        raw = direct()
        raw.update(qkdSessions=[], quantumPaths=[])
        raw['edges'][0]['config']['protection'] = 'none'
        result = run_experiment(SystemGraph.model_validate(raw), 'ideal_qkd', data_input())
        self.assertEqual(result['state'], 'completed')
        self.assertEqual(result['dataResults'][0]['receivedPayload'], data_input().dataInputs[0].plaintext)
        self.assertFalse(result['dataResults'][0]['integrityVerified'])
        self.assertNotIn('ciphertext', result['dataResults'][0])

    def test_multiple_links_explicit_session_and_reverse_direction(self):
        raw = direct()
        raw['qkdSessions'][0]['config']['sequenceLength'] = 2048
        other = copy.deepcopy(raw['qkdSessions'][0])
        other.update(id='s2', pathIds=['p2'])
        other['config']['securityMarginBits'] = 65536
        raw['qkdSessions'].append(other)
        raw['quantumPaths'].append({**raw['quantumPaths'][0], 'id': 'p2', 'sessionId': 's2'})
        raw['edges'][0]['config']['keySource'] = 's'
        raw['edges'].append({'id': 'd2', 'type': 'data_link', 'source': 'b', 'target': 'a', 'config': {'protection': 'aes_256_gcm', 'keySource': 's2'}})
        graph = SystemGraph.model_validate(raw)
        inputs = ExperimentInput.model_validate({'dataInputs': [{'edgeId': 'd', 'plaintext': 'one'}, {'edgeId': 'd2', 'plaintext': 'two'}]})
        result = run_experiment(graph, 'ideal_qkd', inputs)
        self.assertEqual([d['applicationStatus'] for d in result['dataResults']], ['encrypted', 'insufficient_key'])
        raw['edges'][1]['config']['keySource'] = 's'
        result = run_experiment(SystemGraph.model_validate(raw), 'ideal_qkd', inputs)
        self.assertEqual(result['dataResults'][1]['decryptedPayload'], 'two')


class SecurityApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(router)
        cls.client = TestClient(app)

    def test_post_envelope_and_get_metadata_only(self):
        request = {'graph': full_graph().model_dump(by_alias=True, exclude_none=True), 'scope': 'ideal_qkd', 'input': data_input().model_dump()}
        response = self.client.post('/v1/designer/experiments', json=request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['dataResults'][0]['decryptedPayload'], data_input().dataInputs[0].plaintext)
        stored = self.client.get('/v1/designer/experiments/' + response.json()['id'])
        self.assertNotIn(data_input().dataInputs[0].plaintext, stored.text)
        self.assertNotIn('ciphertext', stored.text)

    def test_invalid_input_never_echoes_or_accepts_unknown_edges(self):
        for input in [
            {'dataInputs': [{'edgeId': 'unknown', 'plaintext': 'SECRET'}]},
            {'dataInputs': [{'edgeId': 'd', 'plaintext': 'SECRET'}] * 2},
            {'dataInputs': [{'edgeId': 'd', 'plaintext': 'SECRET', 'keyBits': [1]}]},
            {'dataInputs': [{'edgeId': 'd', 'plaintext': 'é' * 250001}]},
        ]:
            response = self.client.post('/v1/designer/experiments', json={'graph': direct(), 'scope': 'ideal_qkd', 'input': input})
            self.assertEqual(response.status_code, 422)
            self.assertNotIn('SECRET', response.text)
        response = self.client.post('/v1/designer/experiments', json={'graph': direct(), 'scope': 'ideal_acquisition', 'input': {}})
        self.assertEqual(response.status_code, 422)


if __name__ == '__main__':
    unittest.main()
