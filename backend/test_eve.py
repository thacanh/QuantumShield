import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.designer.eve import estimate_information, observe_ideal
from backend.designer.experiments import run_experiment, store
from backend.designer.hardware import HardwareStore
from backend.designer.ideal import EveObservation, PreparedStates, RawMeasurements, acquire_path, prepare_session, run_session
from backend.designer.protocol import compile_protocol
from backend.designer.router import router
from backend.designer.schemas import ExperimentInput, SystemGraph
from backend.model import binary_entropy
from backend.test_designer import direct, trusted


def attacked(factory=direct, length=16384, legs=(0,)):
    raw = factory()
    raw['qkdSessions'][0]['config']['sequenceLength'] = length
    for i in legs:
        raw['quantumPaths'][i]['viaEveId'] = 'e'
    return SystemGraph.model_validate(raw)


class EveTests(unittest.TestCase):
    def test_passive_eve_never_changes_legitimate_measurements(self):
        for factory, legs in ((direct, (0,)), (trusted, (0,)), (trusted, (1,)), (trusted, (0, 1))):
            graph = attacked(factory, legs=legs)
            for offset in (0, 20, 100, 200):
                for path in graph.quantumPaths:
                    path.eveOffsetMeters = offset
                    states = prepare_session(graph.qkdSessions[0])
                    measured, _ = acquire_path(states, graph.qkdSessions[0], path)
                    baseline = path.model_copy(update={'viaEveId': None})
                    clean, _ = acquire_path(states, graph.qkdSessions[0], baseline)
                    self.assertEqual((measured.bits, measured.bases), (clean.bits, clean.bases))
            result = run_experiment(graph, 'qkd')['sessions'][0]
            self.assertEqual(result['qkdStatus'], 'completed')
            self.assertEqual(result['qber'], 0)
            self.assertEqual(len(result['eveReport']['paths']), len(legs))
            self.assertEqual(result['preview'], [])

    def test_offset_changes_gaussian_collection_not_state_or_basis_stream(self):
        graph = attacked(length=8192)
        path, session = graph.quantumPaths[0], graph.qkdSessions[0]
        states = prepare_session(session)
        traces = []
        for offset in (0, 20, 100, 200):
            path.eveOffsetMeters = offset
            traces.append(observe_ideal(states, session, path))
        counts = [sum(b != -1 for b in trace.bits) for trace in traces]
        self.assertEqual(counts[0], 8192)
        self.assertEqual(counts, sorted(counts, reverse=True))
        self.assertLess(counts[-1], 10)
        self.assertEqual(traces[0].bases, traces[-1].bases)
        self.assertEqual(traces[-1].receiver_id, 'b')
        self.assertEqual(states, prepare_session(session))

    def test_determinism_and_attack_does_not_shift_source_or_receiver_streams(self):
        graph = attacked(trusted, length=1024, legs=(0, 1))
        original = prepare_session(graph.qkdSessions[0])
        first = run_experiment(graph, 'acquisition')['sessions']
        graph.nodes.reverse()
        graph.quantumPaths.reverse()
        graph.nodes[0].name = 'Renamed'
        self.assertEqual(first, run_experiment(graph, 'acquisition')['sessions'])
        for path in graph.quantumPaths:
            with_eve = acquire_path(original, graph.qkdSessions[0], path)[0]
            path.viaEveId = None
            clean = acquire_path(original, graph.qkdSessions[0], path)[0]
            self.assertEqual(with_eve.bases, clean.bases)
        self.assertEqual(original, prepare_session(graph.qkdSessions[0]))
        self.assertNotEqual(first[0]['preview'][0]['eve'][0]['pathId'], first[0]['preview'][0]['eve'][1]['pathId'])

    def test_same_eve_on_two_paths_has_independent_streams(self):
        graph = attacked(trusted, length=1024, legs=(0, 1))
        states = prepare_session(graph.qkdSessions[0])
        traces = [observe_ideal(states, graph.qkdSessions[0], p) for p in graph.quantumPaths]
        self.assertNotEqual(traces[0].bases, traces[1].bases)

    def test_estimator_uses_only_retained_reference_and_caps_sum(self):
        keep = (True, True, False, False)
        reference = (0, 1, 0, 1)
        def measurement(bits, path='p'):
            return RawMeasurements(reference, (0,)*4, eve=EveObservation('e', path, bits, (0,)*4))
        report = estimate_information(reference, keep, [measurement((0, 1, 1, 0))])
        self.assertAlmostEqual(report['estimatedInformationBits'], 2*(1-binary_entropy(0)))
        self.assertEqual(report['paths'][0]['errorCount'], 0)
        self.assertEqual(estimate_information(reference, keep, [measurement((1, 1, 0, 1))])['estimatedInformationBits'], 0)
        both = estimate_information(reference, keep, [measurement(reference), measurement(reference, 'p2')])
        self.assertEqual(both['estimatedInformationBits'], 2)
        self.assertEqual(estimate_information(reference, (False,)*4, [measurement(reference)])['paths'][0]['peve'], None)
        self.assertEqual(estimate_information(reference, keep, [])['estimatedInformationBits'], 0)

    def test_trusted_estimator_reference_is_first_receiver_not_distributor(self):
        graph = attacked(trusted, length=4)
        states = PreparedStates((0, 1, 0, 1), (0,)*4)
        # Synthetic received observations distinguish source from actual reconciliation reference.
        a = RawMeasurements((0,)*4, (0,)*4, eve=EveObservation('e', 'p', (0,)*4, (0,)*4))
        b = RawMeasurements((0,)*4, (0,)*4)
        session = graph.qkdSessions[0]
        result = run_session(graph, session, compile_protocol(graph, session), acquisition=(states, [a, b], [{}, {}]))
        self.assertEqual(result['eveReport']['paths'][0]['errorCount'], 0)
        self.assertGreater(result['eveReport']['estimatedInformationBits'], .99*result['siftedCount'])

    def test_fso_reuses_original_states_window_and_gen_eve_without_receiver_disturbance(self):
        from backend.designer.fso import measure_fso
        from backend.model import Gen_Eve
        graph = attacked(length=8192)
        path, session = graph.quantumPaths[0], graph.qkdSessions[0]
        path.providerConfig = {'model': 'current_fso', 'thresholdMode': 'fixed', 'fixedRho': 1.5}
        states = prepare_session(session)
        path.eveOffsetMeters = 20
        with patch('backend.designer.fso.measure_fso', wraps=measure_fso) as fso, patch('backend.designer.eve.Gen_Eve', wraps=Gen_Eve) as eve:
            near, metadata = acquire_path(states, session, path)
            self.assertEqual(fso.call_count, 1)
            self.assertEqual(fso.call_args.args[0], states)
            self.assertEqual(eve.call_count, 1)
            self.assertEqual(eve.call_args.args[1], 20)
            self.assertEqual(tuple(eve.call_args.args[2].tolist()), states.bits)
        self.assertEqual(near, acquire_path(states, session, path)[0])
        path.eveOffsetMeters = 200
        far, _ = acquire_path(states, session, path)
        path.viaEveId = None
        clean, _ = acquire_path(states, session, path)
        self.assertEqual((near.bits, far.bits), (clean.bits, clean.bits))
        self.assertEqual(near.eve.bases, far.eve.bases)
        self.assertGreater(near.eve.overlap, far.eve.overlap)
        self.assertGreater(far.eve.bits.count(-1), near.eve.bits.count(-1))
        self.assertGreater(metadata['erasedCount'], 0)

    def test_erased_eve_samples_are_not_information_or_errors(self):
        reference = (0, 1, 0, 1)
        measurement = RawMeasurements(reference, (0,)*4, eve=EveObservation('e', 'p', (0, -1, -1, -1), (0,)*4))
        report = estimate_information(reference, (True,)*4, [measurement])
        self.assertEqual(report['paths'][0]['detectedCount'], 1)
        self.assertEqual(report['paths'][0]['erasedCount'], 3)
        self.assertEqual(report['paths'][0]['errorCount'], 0)
        self.assertAlmostEqual(report['estimatedInformationBits'], 1, places=6)
        erased = RawMeasurements(reference, (0,)*4, eve=EveObservation('e', 'p', (-1,)*4, (0,)*4))
        report = estimate_information(reference, (True,)*4, [erased])
        self.assertIsNone(report['paths'][0]['peve'])
        self.assertEqual(report['estimatedInformationBits'], 0)

    def test_offset_validation_and_exact_receiver_metadata(self):
        from backend.designer.validator import validate_graph
        for factory, legs, targets in ((direct, (0,), ['b']), (trusted, (0, 1), ['a', 'b'])):
            graph = attacked(factory, length=64, legs=legs)
            result = run_experiment(graph, 'acquisition')['sessions'][0]
            self.assertEqual([p['receiverId'] for p in result['eveReport']['paths']], targets)
        raw = attacked(length=64).model_dump(by_alias=True, exclude_none=True)
        raw['qkdSessions'][0]['participantIds'].reverse()
        raw['quantumPaths'][0].update(source='b', target='a')
        self.assertTrue(validate_graph(raw).valid)
        result = run_experiment(SystemGraph.model_validate(raw), 'acquisition')['sessions'][0]
        self.assertEqual(result['eveReport']['paths'][0]['receiverId'], 'a')
        for invalid in (-1, 201, float('nan'), '20', None):
            raw['quantumPaths'][0]['eveOffsetMeters'] = invalid
            self.assertFalse(validate_graph(raw).valid)

    def test_http_new_scope_legacy_rejection_route_and_physical_eve(self):
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        raw = attacked(length=64).model_dump(by_alias=True, exclude_none=True)
        for scope in ('ideal_acquisition', 'ideal_qkd', 'software_acquisition', 'software_qkd'):
            self.assertEqual(client.post('/v1/designer/experiments', json={'graph': raw, 'scope': scope}).status_code, 422)
        response = client.post('/v1/designer/experiments', json={'graph': raw, 'scope': 'acquisition'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['sessions'][0]['preview'][0]['eve'])
        graph = SystemGraph.model_validate(raw)
        route = next(n for n in compile_protocol(graph, graph.qkdSessions[0])['nodes'] if n['stage'] == 'quantum_transmission')
        self.assertEqual(route['routeLabel'], 'a → b')
        self.assertEqual(route['attackModel'], 'receiver_side_fso')
        self.assertEqual(route['eveReceiverId'], 'b')
        self.assertNotIn('resendBit', response.text)
        raw['quantumPaths'][0].update(provider='thorlabs', providerConfig={})
        response = client.post('/v1/designer/experiments', json={'graph': raw, 'scope': 'qkd'})
        self.assertEqual(response.status_code, 422)
        self.assertIn('UNSUPPORTED_PHYSICAL_EVE', response.text)

    def test_mixed_manual_and_attacked_sim_path_preserves_trace_privately(self):
        graph = attacked(trusted, length=32, legs=(1,))
        graph.quantumPaths[0].provider = 'thorlabs'
        graph.quantumPaths[0].providerConfig = {}
        hardware = HardwareStore()
        with patch('backend.designer.hardware.hardware_store', hardware):
            result = run_experiment(graph, 'qkd')
            while result['state'] == 'waiting_for_hardware':
                task = result['currentTask']
                ack = hardware.submit(result['id'], task['taskId'], 'D1' if task['preparedBit'] else 'D0')
                result = ack.get('result') or hardware.get(result['id'])
        session = result['sessions'][0]
        self.assertEqual([p['origin'] for p in session['pathResults']], ['HW', 'SIM'])
        self.assertEqual(session['eveReport']['paths'][0]['pathId'], 'p2')
        self.assertEqual(session['preview'], [])
        self.assertEqual(hardware.entries[result['id']][1].acquisitions, {})


if __name__ == '__main__':
    unittest.main()
