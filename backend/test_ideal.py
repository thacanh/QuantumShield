import copy
import random
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.designer.experiments import ExperimentStore, run_experiment
from backend.designer.ideal import PreparedStates, RawMeasurements, bit_stream, measure, run_session, sift_and_qber
from backend.designer.protocol import compile_protocol, validate_protocol
from backend.designer.router import router
from backend.designer.schemas import SystemGraph
from backend.test_designer import direct, trusted


class ProtocolAndIdealTests(unittest.TestCase):
    def test_canonical_templates_have_one_preparation_and_typed_complete_pipeline(self):
        for factory, branches in ((direct, 1), (trusted, 2)):
            graph = SystemGraph.model_validate(factory())
            protocol = compile_protocol(graph, graph.qkdSessions[0])
            self.assertIsNone(validate_protocol(protocol))
            self.assertEqual(sum(n['stage'] == 'state_preparation' for n in protocol['nodes']), 1)
            self.assertEqual(sum(n['stage'] == 'measurement' for n in protocol['nodes']), branches)
            self.assertEqual([n['stage'] for n in protocol['nodes']][-4:], ['error_correction', 'key_verification', 'privacy_amplification', 'key_store'])

    def test_missing_stage_input_and_wrong_artifact_rejected_without_repair(self):
        graph = SystemGraph.model_validate(direct())
        protocol = compile_protocol(graph, graph.qkdSessions[0])
        for mutate in (lambda p: p['nodes'].pop(), lambda p: p['edges'].pop(),
                       lambda p: p['edges'][0].update(artifact='raw_measurements'),
                       lambda p: p['nodes'][0]['outputs'].update(states='raw_measurements'),
                       lambda p: p['edges'].append(copy.deepcopy(p['edges'][0]))):
            broken = copy.deepcopy(protocol)
            mutate(broken)
            before = copy.deepcopy(broken)
            with self.assertRaisesRegex(ValueError, 'INVALID_PROTOCOL_GRAPH'):
                validate_protocol(broken)
            self.assertEqual(broken, before)
        # Well-typed self-cycle in transmission is still invalid.
        broken = copy.deepcopy(protocol)
        broken['edges'][0]['source'] = 'transmit:0'
        with self.assertRaisesRegex(ValueError, 'INVALID_PROTOCOL_GRAPH'):
            validate_protocol(broken)

    def test_measurement_same_basis_mismatch_and_alignment(self):
        states = PreparedStates((0, 1, 0, 1), (0, 0, 1, 1))
        self.assertEqual(measure(states, states.bases, (1, 0, 1, 0)).bits, states.bits)
        self.assertEqual(measure(states, (1, 1, 0, 0), (1, 0, 1, 0)).bits, (1, 0, 1, 0))
        with self.assertRaisesRegex(ValueError, 'MISALIGNED'):
            measure(states, (0,), (0,))

    def test_direct_sifting_errors_and_zero_sift(self):
        states = PreparedStates((0, 1, 0, 1), (0, 0, 1, 1))
        keep, count, errors, qber = sift_and_qber(states, [RawMeasurements((0, 0, 1, 1), (0, 0, 0, 1))], False)
        self.assertEqual(keep, (True, True, False, True))
        self.assertEqual((count, errors), (3, 1))
        self.assertAlmostEqual(qber, 1 / 3, places=6)
        self.assertIsNone(sift_and_qber(states, [RawMeasurements((0, 0, 0, 0), (1, 1, 0, 0))], False)[3])

    def test_trusted_uses_triple_basis_rule_and_same_sequence_object(self):
        states = PreparedStates((0, 1, 0, 1), (0, 0, 1, 1))
        measurements = [RawMeasurements(states.bits, (0, 1, 1, 0)), RawMeasurements(states.bits, (0, 0, 1, 1))]
        self.assertEqual(sift_and_qber(states, measurements, True)[0], (True, False, True, False))
        graph = SystemGraph.model_validate(trusted())
        with patch('backend.designer.ideal.measure', wraps=measure) as mocked:
            run_session(graph, graph.qkdSessions[0], compile_protocol(graph, graph.qkdSessions[0]))
            self.assertEqual(mocked.call_count, 2)
            self.assertIs(mocked.call_args_list[0].args[0], mocked.call_args_list[1].args[0])

    def test_determinism_independent_streams_and_rename(self):
        random.seed(918)
        before = random.getstate()
        graph = SystemGraph.model_validate(trusted())
        first = run_experiment(graph)
        self.assertEqual(first['sessions'], run_experiment(graph)['sessions'])
        graph.nodes.reverse()
        graph.quantumPaths.reverse()
        graph.nodes[0].name = 'New name'
        self.assertEqual(first['sessions'], run_experiment(graph)['sessions'])
        graph.qkdSessions[0].config.masterSeed += 1
        self.assertNotEqual(first['sessions'][0]['preview'], run_experiment(graph)['sessions'][0]['preview'])
        self.assertEqual(before, random.getstate())
        a = bit_stream(42, 's', 'state_bits', 'a', 1024)
        self.assertEqual(a, bit_stream(42, 's', 'state_bits', 'a', 1024))
        self.assertNotEqual(a, bit_stream(42, 's', 'receiver_bases', 'a', 1024))
        self.assertTrue(400 < sum(a) < 624)

    def test_sifting_rates_and_no_premature_secure_key(self):
        for factory, expected in ((direct, 0.5), (trusted, 0.25)):
            raw = factory()
            raw['qkdSessions'][0]['config']['sequenceLength'] = 16384
            result = run_experiment(SystemGraph.model_validate(raw))['sessions'][0]
            self.assertEqual(result['qber'], 0)
            self.assertAlmostEqual(result['siftRatio'], expected, delta=0.03)
            self.assertIsNone(result['qkdStatus'])
            self.assertEqual(result['keyStatus'], 'none')
            self.assertEqual(result['applicationStatus'], 'not_requested')
            self.assertEqual(len(result['preview']), 64)
            self.assertTrue(all(s['status'] == 'not_run' for s in result['stages'][-4:]))

    def test_abort_boundary_and_session_independence(self):
        graph = SystemGraph.model_validate(direct())
        protocol = compile_protocol(graph, graph.qkdSessions[0])
        for qber, count, code in [(None, 0, 'ZERO_SIFTED_BITS'), (0.11, 10, 'QBER_ABOVE_11_PERCENT'), (0.109, 10, None)]:
            with patch('backend.designer.ideal.sift_and_qber', return_value=((True,) * 32, count, 0, qber)):
                result = run_session(graph, graph.qkdSessions[0], protocol)
                self.assertEqual(result['abortReason'], code)
        raw = direct()
        raw['edges'] = []
        raw['qkdSessions'].append({**copy.deepcopy(raw['qkdSessions'][0]), 'id': 's2', 'pathIds': ['p2']})
        raw['quantumPaths'].append({**copy.deepcopy(raw['quantumPaths'][0]), 'id': 'p2', 'sessionId': 's2'})
        original = run_session
        def one_abort(g, s, p, **kwargs):
            value = original(g, s, p, **kwargs)
            if s.id == 's':
                value.update(acquisitionStatus='aborted', qkdStatus='aborted', abortReason='ZERO_SIFTED_BITS')
            return value
        with patch('backend.designer.experiments.run_session', side_effect=one_abort):
            result = run_experiment(SystemGraph.model_validate(raw))
            self.assertEqual(result['state'], 'completed')
            self.assertEqual([r['acquisitionStatus'] for r in result['sessions']], ['aborted', 'completed'])

    def test_store_snapshot_ttl_and_capacity(self):
        now = [0]
        store = ExperimentStore(capacity=2, ttl=10, clock=lambda: now[0])
        original = {'id': '1', 'nested': [0]}
        store.put(original)
        original['nested'][0] = 7
        fetched = store.get('1')
        fetched['nested'][0] = 8
        self.assertEqual(store.get('1')['nested'], [0])
        store.put({'id': '2'})
        store.put({'id': '3'})
        self.assertIsNone(store.get('1'))
        now[0] = 10
        self.assertIsNone(store.get('2'))


class IdealApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(router)
        cls.client = TestClient(app)

    def test_templates_create_get_snapshot_and_reproducibility(self):
        graph = trusted()
        response = self.client.post('/v1/designer/protocols', json={'graph': graph})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['protocols'][0]['nodes']), 12)
        response = self.client.post('/v1/designer/experiments', json={'graph': graph, 'scope': 'ideal_acquisition'})
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(self.client.get('/v1/designer/experiments/' + result['id']).json(), result)
        graph['name'] = 'Edited afterwards'
        self.assertNotEqual(result['graphSnapshot']['name'], graph['name'])
        second = self.client.post('/v1/designer/experiments', json={'graph': graph, 'scope': 'ideal_acquisition'}).json()
        self.assertEqual(result['sessions'], second['sessions'])
        for field in ('siftedKey', 'finalKey', 'keyBits', 'plaintext_payload'):
            self.assertNotIn(field, response.text)
        self.assertEqual(self.client.get('/v1/designer/experiments/missing').status_code, 404)

    def test_unsupported_paths_scope_limits_and_invalid_graph_rejected(self):
        for provider, config, eve in [('thorlabs', {}, None), ('simulation', {'model': 'current_fso'}, None), ('simulation', {'model': 'ideal'}, 'e')]:
            graph = direct()
            graph['quantumPaths'][0].update(provider=provider, providerConfig=config)
            if eve:
                graph['quantumPaths'][0]['viaEveId'] = eve
            response = self.client.post('/v1/designer/experiments', json={'graph': graph, 'scope': 'ideal_acquisition'})
            self.assertEqual(response.status_code, 422)
        for payload in ({'graph': direct(), 'scope': 'full'}, {'graph': direct(), 'scope': 'ideal_acquisition', 'seed': 42},
                        {'graph': {}, 'scope': 'ideal_acquisition'}):
            self.assertEqual(self.client.post('/v1/designer/experiments', json=payload).status_code, 422)
        graph = direct()
        graph.update(edges=[], qkdSessions=[], quantumPaths=[])
        response = self.client.post('/v1/designer/experiments', json={'graph': graph, 'scope': 'ideal_acquisition'})
        self.assertEqual(response.json()['errors'][0]['code'], 'NO_QKD_SESSION')
        for i in range(5):
            session = copy.deepcopy(direct()['qkdSessions'][0])
            session.update(id=f's{i}', pathIds=[f'p{i}'])
            session['config']['sequenceLength'] = 65536
            graph['qkdSessions'].append(session)
            graph['quantumPaths'].append({**direct()['quantumPaths'][0], 'id': f'p{i}', 'sessionId': f's{i}'})
        response = self.client.post('/v1/designer/experiments', json={'graph': graph, 'scope': 'ideal_acquisition'})
        self.assertEqual(response.json()['errors'][0]['code'], 'EXPERIMENT_STATE_LIMIT')


if __name__ == '__main__':
    unittest.main()
