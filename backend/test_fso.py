import copy
import unittest
from unittest.mock import patch

import torch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import channel_runtime
from backend.designer.experiments import run_experiment
from backend.designer.fso import measure_fso, cpu_policy
from backend.designer.ideal import PreparedStates, RawMeasurements, sift_and_qber
from backend.designer.router import router
from backend.designer.schemas import ExperimentInput, SystemGraph
from backend.model import Gen_AB, receive_external_states
from backend.test_designer import direct, trusted


def fso_graph(factory=direct, length=4096):
    raw = factory()
    raw['qkdSessions'][0]['config']['sequenceLength'] = length
    for path in raw['quantumPaths']:
        path['providerConfig'] = {'model': 'current_fso'}
    return SystemGraph.model_validate(raw)


class FsoTests(unittest.TestCase):
    def test_external_receiver_exact_legacy_equation_and_rng(self):
        h = torch.linspace(0, 1, 1024)
        ia, ib, bits, prepared, a, b, amplitude = Gen_AB(h, .003, 'cpu')
        rng = torch.Generator().manual_seed(42)
        for _ in range(4):
            torch.randint(0, 2, (1024,), generator=rng)
        for expected, basis in ((ia, a), (ib, b)):
            signal, actual_amp = receive_external_states(h, .003, bits, prepared, basis, generator=rng)
            self.assertTrue(torch.equal(signal, expected))
            self.assertTrue(torch.equal(actual_amp, amplitude))
        with self.assertRaisesRegex(ValueError, 'MISALIGNED'):
            receive_external_states(h[:1], .003, bits, prepared, a, generator=rng)

    def test_all_datasets_threshold_modes_and_wrapped_windows(self):
        means = []
        for dataset in channel_runtime.CHANNEL_DATASETS:
            for mode in ('fixed', 'adaptive'):
                graph = fso_graph()
                graph.quantumPaths[0].providerConfig.update(dataset=dataset, thresholdMode=mode, fixedRho=1.75, windowStart=2**24-9)
                with self.subTest(dataset=dataset, mode=mode):
                    result = run_experiment(graph, 'software_acquisition')['sessions'][0]
                    p = result['pathResults'][0]
                    self.assertEqual(p['measuredCount'], 4096)
                    self.assertEqual(p['detectedCount'] + p['erasedCount'], 4096)
                    self.assertGreater(p['erasedCount'], 0)
                    self.assertEqual((p['dataset'], p['windowStart'], p['datasetSize']), (dataset, 2**24-9, 2**24))
                    self.assertGreaterEqual(p['rho'], 0)
                    self.assertLessEqual(p['rho'], 5)
                    if mode == 'fixed':
                        self.assertEqual(p['rho'], 1.75)
                        means.append(p['channelMean'])
        self.assertEqual(len(set(means)), 3)

    def test_erasures_removed_without_losing_index_alignment(self):
        states = PreparedStates((0, 1, 0, 1), (0, 0, 1, 1))
        a = RawMeasurements((-1, 1, 1, 1), states.bases)
        b = RawMeasurements((0, -1, 0, 0), states.bases)
        self.assertEqual(sift_and_qber(states, [a], False), ((False, True, True, True), 3, 1, torch.tensor(1/3).item()))
        self.assertEqual(sift_and_qber(states, [a, b], True), ((False, False, True, True), 2, 2, 1.0))
        self.assertIsNone(sift_and_qber(states, [RawMeasurements((-1,)*4, states.bases)], False)[3])

    def test_fso_receivers_share_prepared_sequence_and_have_independent_noise(self):
        graph = fso_graph(trusted)
        with patch('backend.designer.fso.measure_fso', wraps=measure_fso) as mocked:
            run_experiment(graph, 'software_acquisition')
            self.assertIs(mocked.call_args_list[0].args[0], mocked.call_args_list[1].args[0])
        states = PreparedStates((0, 1)*2048, (0,)*4096)
        session = graph.qkdSessions[0]
        a = measure_fso(states, states.bases, session, graph.quantumPaths[0])[0]
        b = measure_fso(states, states.bases, session, graph.quantumPaths[1])[0]
        self.assertNotEqual(a.bits, b.bits)
        self.assertEqual(a.bits, measure_fso(states, states.bases, session, graph.quantumPaths[0])[0].bits)

    def test_reproducibility_rename_reorder_and_no_global_rng_changes(self):
        cpu_policy()  # Asset initialization is outside acquisition RNG assertions.
        graph = fso_graph(trusted)
        before = torch.get_rng_state().clone()
        first = run_experiment(graph, 'software_acquisition')['sessions']
        graph.nodes.reverse()
        graph.quantumPaths.reverse()
        graph.nodes[0].name = 'Renamed'
        self.assertEqual(first, run_experiment(graph, 'software_acquisition')['sessions'])
        self.assertTrue(torch.equal(before, torch.get_rng_state()))
        graph.qkdSessions[0].config.masterSeed += 1
        self.assertNotEqual(first[0]['preview'], run_experiment(graph, 'software_acquisition')['sessions'][0]['preview'])

    def test_mixed_ideal_fso_and_short_sequence(self):
        for length in (1, 32, 4096):
            graph = fso_graph(trusted, length)
            graph.quantumPaths[0].providerConfig = {'model': 'ideal'}
            result = run_experiment(graph, 'software_acquisition')['sessions'][0]
            self.assertEqual([p['model'] for p in result['pathResults']], ['ideal', 'current_fso'])
            self.assertEqual(len(result['preview']), min(length, 64))
            self.assertEqual(result['pathResults'][1]['measuredCount'], length)
            if length == 1:
                self.assertEqual(result['pathResults'][1]['channelStd'], 0)

    def test_fixed_mode_does_not_invoke_policy(self):
        graph = fso_graph()
        graph.quantumPaths[0].providerConfig.update(thresholdMode='fixed', fixedRho=2)
        with patch('backend.designer.fso.cpu_policy', side_effect=AssertionError('must not use policy')):
            run_experiment(graph, 'software_acquisition')

    def test_full_fso_qkd_encryption_and_low_threshold_abort(self):
        graph = fso_graph(length=16384)
        payload = ExperimentInput(dataInputs=[{'edgeId': 'd', 'plaintext': 'FSO round trip'}])
        result = run_experiment(graph, 'software_qkd', payload)
        self.assertEqual(result['sessions'][0]['qkdStatus'], 'completed')
        self.assertEqual(result['sessions'][0]['preview'], [])
        self.assertEqual(result['dataResults'][0]['applicationStatus'], 'encrypted')
        self.assertEqual(result['dataResults'][0]['decryptedPayload'], 'FSO round trip')
        graph.quantumPaths[0].providerConfig.update(thresholdMode='fixed', fixedRho=0, Pt_dBm=-5, dataset='lightrain.csv')
        result = run_experiment(graph, 'software_qkd', payload)
        self.assertEqual(result['sessions'][0]['abortReason'], 'QBER_ABOVE_11_PERCENT')
        self.assertNotIn('ciphertext', result['dataResults'][0])

    def test_http_scope_compatibility_and_unavailable_provider(self):
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        graph = fso_graph().model_dump(by_alias=True, exclude_none=True)
        body = {'graph': graph, 'scope': 'ideal_acquisition'}
        self.assertEqual(client.post('/v1/designer/experiments', json=body).status_code, 422)
        body['scope'] = 'software_acquisition'
        self.assertEqual(client.post('/v1/designer/experiments', json=body).status_code, 200)
        with patch.object(channel_runtime, 'slice_channel_window', side_effect=OSError('private filesystem details')):
            response = client.post('/v1/designer/experiments', json=body)
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json(), {'errors': [{'code': 'FSO_PROVIDER_UNAVAILABLE'}]})
        for mutation in ('hardware', 'eve'):
            rejected = copy.deepcopy(body)
            if mutation == 'hardware':
                rejected['graph']['quantumPaths'][0].update(provider='thorlabs', providerConfig={})
            else:
                rejected['graph']['quantumPaths'][0]['viaEveId'] = 'e'
            self.assertEqual(client.post('/v1/designer/experiments', json=rejected).status_code, 422)


if __name__ == '__main__':
    unittest.main()
