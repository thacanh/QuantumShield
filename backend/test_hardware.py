import copy
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.designer.experiments import acquisition_issues, complete_experiment, run_experiment
from backend.designer.hardware import HardwareError, HardwareStore
from backend.designer.router import router
from backend.designer.schemas import ExperimentInput, SystemGraph
from backend.test_designer import direct, trusted


def hardware_graph(factory=direct, providers=('thorlabs',), length=32):
    raw = factory()
    raw['qkdSessions'][0]['config'].update(sequenceLength=length, securityMarginBits=0)
    for path, provider in zip(raw['quantumPaths'], providers):
        path.update(provider=provider, providerConfig={} if provider == 'thorlabs' else {'model': 'ideal'})
    return SystemGraph.model_validate(raw)


class HardwareTests(unittest.TestCase):
    def setUp(self):
        self.store = HardwareStore()
        self.patch = patch('backend.designer.hardware.hardware_store', self.store)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def finish(self, result, flipped=False):
        tasks = []
        while result['state'] == 'waiting_for_hardware':
            task = result['currentTask']
            tasks.append(task)
            detector = 'D1' if task['preparedBit'] ^ flipped else 'D0'
            ack = self.store.submit(result['id'], task['taskId'], detector)
            result = ack.get('result') or self.store.get(result['id'])
        return result, tasks, ack

    def test_direct_completed_short_key_and_terminal_cleanup(self):
        payload = ExperimentInput(dataInputs=[{'edgeId': 'd', 'plaintext': 'private test data'}])
        pending = run_experiment(hardware_graph(), 'qkd', payload)
        self.assertEqual(pending['progress'], {'completed': 0, 'total': 32})
        self.assertEqual(pending['sessions'], [])
        final, tasks, ack = self.finish(pending)
        self.assertEqual(final['state'], 'completed')
        session = final['sessions'][0]
        self.assertEqual(session['qkdStatus'], 'completed')
        self.assertEqual(session['keyStatus'], 'verified')
        self.assertTrue(0 < session['finalKeyLength'] < 256)
        self.assertEqual(final['dataResults'][0]['applicationStatus'], 'insufficient_key')
        self.assertEqual(session['preview'], [])
        self.assertEqual(session['pathResults'][0]['origin'], 'HW')
        private = self.store.entries[pending['id']][1]
        self.assertIsNone(private.input)
        self.assertIsNone(private.graph)
        self.assertEqual((private.acquisitions, private.observations, private.tasks), ({}, {}, []))
        self.assertEqual(self.store.submit(pending['id'], tasks[-1]['taskId'], 'D1' if tasks[-1]['preparedBit'] else 'D0'), ack)

    def test_trusted_all_hardware_simulation_combinations_and_sequence(self):
        for providers in (('thorlabs', 'thorlabs'), ('thorlabs', 'simulation'), ('simulation', 'thorlabs')):
            with self.subTest(providers=providers):
                pending = run_experiment(hardware_graph(trusted, providers), 'qkd')
                final, tasks, _ = self.finish(pending)
                self.assertEqual(final['sessions'][0]['qkdStatus'], 'completed')
                self.assertEqual([p['origin'] for p in final['sessions'][0]['pathResults']], ['HW' if p == 'thorlabs' else 'SIM' for p in providers])
                if providers == ('thorlabs', 'thorlabs'):
                    self.assertEqual([t['roleNodeId'] for t in tasks], ['a']*32 + ['b']*32)
                    self.assertEqual([(t['stateIndex'], t['preparedBit'], t['preparedBasis']) for t in tasks[:32]],
                                     [(t['stateIndex'], t['preparedBit'], t['preparedBasis']) for t in tasks[32:]])

    def test_real_observations_used_instead_of_expected_answers(self):
        final, _, _ = self.finish(run_experiment(hardware_graph(), 'qkd'), flipped=True)
        self.assertEqual(final['sessions'][0]['qber'], 1)
        self.assertEqual(final['sessions'][0]['abortReason'], 'QBER_ABOVE_11_PERCENT')
        self.assertIsNone(final['sessions'][0]['sharedKeyHandle'])

    def test_stale_foreign_duplicate_and_conflicting_submissions(self):
        first = run_experiment(hardware_graph(), 'acquisition')
        second = run_experiment(hardware_graph(), 'acquisition')
        task = first['currentTask']
        for invalid in ('unknown', second['currentTask']['taskId'], self.store.entries[first['id']][1].tasks[1][0]):
            with self.assertRaisesRegex(HardwareError, 'STALE_ACQUISITION_TASK'):
                self.store.submit(first['id'], invalid, 'D0')
        ack = self.store.submit(first['id'], task['taskId'], 'D0')
        self.assertEqual(ack, self.store.submit(first['id'], task['taskId'], 'D0'))
        with self.assertRaisesRegex(HardwareError, 'TASK_ALREADY_COMPLETED'):
            self.store.submit(first['id'], task['taskId'], 'D1')
        self.assertEqual(self.store.get(first['id'])['progress']['completed'], 1)
        ack['completedCount'] = 999
        self.assertEqual(self.store.submit(first['id'], task['taskId'], 'D0')['completedCount'], 1)

    def test_concurrent_duplicate_last_task_finalizes_once(self):
        pending = run_experiment(hardware_graph(length=1), 'qkd')
        id, task_id = pending['id'], pending['currentTask']['taskId']
        with patch('backend.designer.experiments.complete_experiment', wraps=complete_experiment) as finalizer:
            with ThreadPoolExecutor(max_workers=2) as pool:
                responses = list(pool.map(lambda _: self.store.submit(id, task_id, 'D0'), range(2)))
            self.assertEqual(responses[0], responses[1])
            self.assertEqual(finalizer.call_count, 1)
        self.assertEqual(self.store.get(id)['progress']['completed'], 1)

    def test_cancel_cleans_raw_input_preserves_completed_retry(self):
        pending = run_experiment(hardware_graph(), 'qkd', ExperimentInput(dataInputs=[{'edgeId': 'd', 'plaintext': 'secret'}]))
        id, task_id = pending['id'], pending['currentTask']['taskId']
        ack = self.store.submit(id, task_id, 'D0')
        next_id = self.store.get(id)['currentTask']['taskId']
        cancelled = self.store.cancel(id)
        self.assertEqual(cancelled['state'], 'aborted')
        self.assertEqual(cancelled['diagnostic'], 'HARDWARE_ACQUISITION_CANCELLED')
        self.assertIsNone(cancelled['currentTask'])
        self.assertEqual(self.store.cancel(id), cancelled)
        self.assertEqual(self.store.submit(id, task_id, 'D0'), ack)
        with self.assertRaisesRegex(HardwareError, 'HARDWARE_ACQUISITION_CANCELLED'):
            self.store.submit(id, next_id, 'D1')
        self.assertIsNone(self.store.entries[id][1].input)
        self.assertEqual(self.store.entries[id][1].observations, {})

    def test_ttl_capacity_and_graph_snapshot_isolation(self):
        now = [0]
        store = HardwareStore(capacity=1, ttl=10, clock=lambda: now[0])
        graph = hardware_graph()
        pending = store.create(graph, 'qkd', ExperimentInput())
        graph.qkdSessions[0].config.masterSeed = 100
        graph.nodes[0].name = 'Changed'
        pending['currentTask']['preparedBit'] = 999
        saved = store.get(pending['id'])
        self.assertEqual(saved['graphSnapshot']['nodes'][0]['name'], 'a')
        self.assertEqual(saved['graphSnapshot']['qkdSessions'][0]['config']['masterSeed'], 42)
        self.assertIn(saved['currentTask']['preparedBit'], (0, 1))
        with self.assertRaisesRegex(HardwareError, 'HARDWARE_STORE_FULL'):
            store.create(graph, 'qkd', ExperimentInput())
        now[0] = 10
        with self.assertRaisesRegex(HardwareError, 'EXPERIMENT_NOT_FOUND_OR_EXPIRED'):
            store.get(pending['id'])
        self.assertEqual(len(store.entries), 0)
        store.create(graph, 'qkd', ExperimentInput())

    def test_processing_failure_does_not_repeat_or_keep_secrets(self):
        pending = run_experiment(hardware_graph(length=1), 'qkd')
        with patch('backend.designer.experiments.complete_experiment', side_effect=RuntimeError('secret raw bits')):
            ack = self.store.submit(pending['id'], pending['currentTask']['taskId'], 'D0')
        self.assertEqual(ack['result']['diagnostic'], 'HARDWARE_PROCESSING_FAILED')
        self.assertNotIn('secret', str(ack))
        self.assertIsNone(self.store.entries[pending['id']][1].input)
        self.assertEqual(self.store.submit(pending['id'], pending['currentTask']['taskId'], 'D0'), ack)

    def test_acquisition_hides_hardware_trace_and_does_not_distill(self):
        final, tasks, _ = self.finish(run_experiment(hardware_graph(), 'acquisition'))
        self.assertIsNone(final['sessions'][0]['qkdStatus'])
        self.assertEqual(final['sessions'][0]['preview'], [])
        for task in tasks:
            expected = (45 if task['preparedBasis'] == 'X' else 0) + 90*task['preparedBit']
            self.assertEqual(task['polarizationDeg'], expected)
            self.assertEqual(task['analyzerDeg'], 45 if task['measurementBasis'] == 'X' else 0)
        self.assertEqual(self.store.cancel(final['id'])['state'], 'completed')

    def test_http_validation_limits_errors_and_final_retry(self):
        app = FastAPI()
        app.include_router(router)
        client = TestClient(app)
        with patch('backend.designer.router.hardware_store', self.store):
            graph = hardware_graph(length=1).model_dump(by_alias=True, exclude_none=True)
            response = client.post('/v1/designer/experiments', json={'graph': graph, 'scope': 'qkd'})
            self.assertEqual(response.status_code, 200)
            pending = response.json()
            route = '/v1/designer/experiments/' + pending['id']
            body = {'task_id': pending['currentTask']['taskId'], 'detector': 'D0'}
            for invalid in ({'detector': 'D0'}, {**body, 'detector': 'secret'}, {**body, 'extra': 'secret'}, {**body, 'task_id': None}):
                rejected = client.post(route+'/measurement', json=invalid)
                self.assertEqual(rejected.status_code, 422)
                self.assertNotIn('secret', rejected.text)
            ack = client.post(route+'/measurement', json=body).json()
            self.assertEqual(client.post(route+'/measurement', json=body).json(), ack)
            self.assertEqual(client.post(route+'/measurement', json={**body, 'detector': 'D1'}).json()['detail'], 'TASK_ALREADY_COMPLETED')
            self.assertIsNone(client.get(route).json()['currentTask'])
            self.assertEqual(client.post('/v1/designer/experiments/missing/cancel').status_code, 404)
            graph['qkdSessions'][0]['config']['sequenceLength'] = 65
            rejected = client.post('/v1/designer/experiments', json={'graph': graph, 'scope': 'qkd'})
            self.assertEqual(rejected.status_code, 422)
            self.assertIn('HARDWARE_SEQUENCE_LIMIT_64', rejected.text)
            graph['qkdSessions'][0]['config']['sequenceLength'] = 32
            graph['quantumPaths'][0]['viaEveId'] = 'e'
            self.assertIn('UNSUPPORTED_PHYSICAL_EVE', client.post('/v1/designer/experiments', json={'graph': graph, 'scope': 'qkd'}).text)

    def test_multi_session_hardware_task_limit(self):
        graph = hardware_graph(length=64)
        for i in range(1, 17):
            session, path = copy.deepcopy(graph.qkdSessions[0]), copy.deepcopy(graph.quantumPaths[0])
            session.id, path.id = f's{i}', f'p{i}'
            session.pathIds, path.sessionId = [path.id], session.id
            graph.qkdSessions.append(session)
            graph.quantumPaths.append(path)
        self.assertIn('HARDWARE_TASK_LIMIT_1024', [i['code'] for i in acquisition_issues(graph, 'qkd')])

    def test_fso_mixed_path_acquired_once_before_manual_pass(self):
        from backend.designer.fso import measure_fso
        graph = hardware_graph(trusted, ('simulation', 'thorlabs'))
        graph.quantumPaths[0].providerConfig = {'model': 'current_fso'}
        with patch('backend.designer.fso.measure_fso', wraps=measure_fso) as fso:
            pending = run_experiment(graph, 'acquisition')
            self.assertEqual(fso.call_count, 1)
            final, _, _ = self.finish(pending)
            self.assertEqual(fso.call_count, 1)
        self.assertEqual([p['model'] for p in final['sessions'][0]['pathResults']], ['current_fso', 'manual'])

    def test_final_ack_payload_cached_but_get_sanitized(self):
        graph = hardware_graph()
        graph.edges[0].config.protection = 'none'
        payload = ExperimentInput(dataInputs=[{'edgeId': 'd', 'plaintext': 'private demo body'}])
        pending = run_experiment(graph, 'qkd', payload)
        final, tasks, ack = self.finish(pending)
        self.assertEqual(final['dataResults'][0]['receivedPayload'], 'private demo body')
        self.assertNotIn('private demo body', str(self.store.get(pending['id'])))
        retry = self.store.submit(pending['id'], tasks[-1]['taskId'], 'D1' if tasks[-1]['preparedBit'] else 'D0')
        self.assertEqual(retry, ack)

    def test_cancel_submit_race_has_one_consistent_terminal_state(self):
        pending = run_experiment(hardware_graph(length=1), 'qkd')
        def submit():
            try:
                return self.store.submit(pending['id'], pending['currentTask']['taskId'], 'D0')
            except HardwareError as exc:
                return exc.code
        with ThreadPoolExecutor(max_workers=2) as pool:
            post = pool.submit(submit)
            cancel = pool.submit(self.store.cancel, pending['id'])
            ack, cancelled = post.result(), cancel.result()
        final = self.store.get(pending['id'])
        self.assertEqual(cancelled, final)
        if isinstance(ack, str):
            self.assertEqual(ack, 'HARDWARE_ACQUISITION_CANCELLED')
            self.assertEqual(final['progress']['completed'], 0)
        else:
            self.assertEqual(final['progress']['completed'], 1)
            self.assertNotIn('HARDWARE_ACQUISITION_CANCELLED', str(final))
        self.assertEqual(self.store.entries[pending['id']][1].observations, {})


if __name__ == '__main__':
    unittest.main()
