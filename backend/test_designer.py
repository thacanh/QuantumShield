import copy
import json
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.designer.router import router
from backend.designer.validator import validate_graph


def direct():
    return {
        "schema": "quantumshield-system", "version": 1, "id": "g", "name": "Test",
        "nodes": [{"id": n, "name": n, "type": kind, "position": {"x": 0, "y": 0}, "config": {}}
                  for n, kind in [("a", "participant"), ("b", "participant"), ("c", "key_distributor"), ("e", "eavesdropper")]],
        "edges": [{"id": "d", "type": "data_link", "source": "a", "target": "b", "config": {"protection": "aes_256_gcm", "keySource": "auto"}}],
        "quantumPaths": [{"id": "p", "sessionId": "s", "source": "a", "target": "b", "provider": "simulation", "providerConfig": {"model": "ideal"}}],
        "qkdSessions": [{"id": "s", "protocol": "direct_bb84", "participantIds": ["a", "b"], "pathIds": ["p"],
                         "config": {"sequenceLength": 32, "masterSeed": 42, "qberAbortThreshold": 0.11, "securityMarginBits": 32}}],
    }


def trusted():
    graph = direct()
    graph["qkdSessions"][0].update(protocol="trusted_distributor", distributorId="c", pathIds=["p", "p2"])
    graph["quantumPaths"][0].update(source="c", target="a")
    graph["quantumPaths"].append({**graph["quantumPaths"][0], "id": "p2", "target": "b"})
    return graph


class DesignerTests(unittest.TestCase):
    def codes(self, graph):
        report = validate_graph(graph)
        self.assertFalse(report.valid)
        return {e.code for e in report.errors}

    def test_direct_and_trusted_all_provider_combinations(self):
        self.assertTrue(validate_graph(direct()).valid)
        for first in ("simulation", "thorlabs"):
            for second in ("simulation", "thorlabs"):
                graph = trusted()
                for p, provider in zip(graph["quantumPaths"], (first, second)):
                    p.update(provider=provider, providerConfig={"model": "ideal"} if provider == "simulation" else {})
                self.assertTrue(validate_graph(graph).valid)

    def test_explicit_eve_and_physical_eve_rejection(self):
        graph = direct()
        graph["quantumPaths"][0]["viaEveId"] = "e"
        self.assertTrue(validate_graph(graph).valid)
        graph["quantumPaths"][0].update(provider="thorlabs", providerConfig={})
        self.assertIn("UNSUPPORTED_PHYSICAL_EVE", self.codes(graph))

    def test_topology_and_bidirectional_references(self):
        cases = [
            (lambda g: g["quantumPaths"][0].update(sessionId="missing"), "ORPHAN_QUANTUM_PATH"),
            (lambda g: g["quantumPaths"][0].update(source="b"), "INVALID_DIRECT_TOPOLOGY"),
            (lambda g: g["qkdSessions"][0].update(pathIds=["missing"]), "INVALID_SESSION_PATHS"),
            (lambda g: g["qkdSessions"][0].update(participantIds=["a", "a"]), "INVALID_SESSION_PARTICIPANTS"),
            (lambda g: g["quantumPaths"][0].update(viaEveId="a"), "INVALID_EVE_REFERENCE"),
            (lambda g: g["nodes"][0].update(id="p"), "DUPLICATE_ID"),
            (lambda g: g["edges"][0].update(target="c"), "INVALID_DATA_ENDPOINTS"),
        ]
        for mutate, expected in cases:
            with self.subTest(expected=expected):
                graph = direct()
                mutate(graph)
                self.assertIn(expected, self.codes(graph))
        graph = trusted()
        graph["quantumPaths"][1]["target"] = "a"
        self.assertIn("INVALID_TRUSTED_TOPOLOGY", self.codes(graph))

    def test_key_source_missing_ambiguous_explicit_and_plaintext(self):
        graph = direct()
        graph["qkdSessions"] = []
        graph["quantumPaths"] = []
        self.assertIn("NO_QKD_PATH", self.codes(graph))
        graph["edges"][0]["config"]["protection"] = "none"
        self.assertTrue(validate_graph(graph).valid)
        graph = direct()
        graph["qkdSessions"].append({**copy.deepcopy(graph["qkdSessions"][0]), "id": "s2", "pathIds": ["p2"]})
        graph["quantumPaths"].append({**copy.deepcopy(graph["quantumPaths"][0]), "id": "p2", "sessionId": "s2"})
        self.assertIn("AMBIGUOUS_KEY_SOURCE", self.codes(graph))
        graph["edges"][0]["config"]["keySource"] = "s2"
        self.assertTrue(validate_graph(graph).valid)
        graph["edges"][0]["config"]["keySource"] = "gone"
        self.assertIn("INVALID_KEY_SOURCE", self.codes(graph))

    def test_strict_numeric_bounds_and_enums(self):
        for field, value in [("sequenceLength", True), ("sequenceLength", 0), ("sequenceLength", 65537),
                             ("masterSeed", -1), ("masterSeed", "42"), ("masterSeed", 4294967296),
                             ("qberAbortThreshold", float("nan")), ("qberAbortThreshold", 0.2), ("securityMarginBits", -1)]:
            with self.subTest(field=field, value=value):
                graph = direct()
                graph["qkdSessions"][0]["config"][field] = value
                self.assertIn("INVALID_SYSTEM_GRAPH", self.codes(graph))
        for field, value in [("xi", 61), ("windowStart", -1), ("Pt_dBm", float("inf")), ("dataset", "../../secret"), ("seed", 42)]:
            graph = direct()
            graph["quantumPaths"][0]["providerConfig"][field] = value
            self.assertIn("INVALID_SYSTEM_GRAPH", self.codes(graph))
        graph = direct()
        graph["version"] = True
        self.assertIn("INVALID_SYSTEM_GRAPH", self.codes(graph))
        for collection, field in [("qkdSessions", "distributorId"), ("quantumPaths", "viaEveId")]:
            graph = direct()
            graph[collection][0][field] = None
            self.assertIn("INVALID_SYSTEM_GRAPH", self.codes(graph))

    def test_secret_fields_rejected_without_echo_or_mutation(self):
        for boundary in (lambda g: g, lambda g: g["nodes"][0]["config"], lambda g: g["qkdSessions"][0]["config"],
                         lambda g: g["quantumPaths"][0]["providerConfig"], lambda g: g["edges"][0]["config"]):
            graph = direct()
            boundary(graph)["plaintext_payload"] = "TEST_SECRET_DO_NOT_ECHO"
            before = copy.deepcopy(graph)
            result = validate_graph(graph)
            self.assertFalse(result.valid)
            self.assertNotIn("TEST_SECRET_DO_NOT_ECHO", result.model_dump_json())
            self.assertEqual(graph, before)

    def test_empty_graph_and_limits(self):
        graph = direct()
        for key in ("nodes", "edges", "quantumPaths", "qkdSessions"):
            graph[key] = []
        report = validate_graph(graph)
        self.assertTrue(report.valid)
        self.assertEqual(report.warnings[0].code, "NO_QKD_SESSION")
        graph["nodes"] = direct()["nodes"] * 26
        self.assertIn("INVALID_SYSTEM_GRAPH", self.codes(graph))

    def test_frontend_contract_fixture(self):
        for graph in json.loads((Path(__file__).parent / "fixtures" / "designer.json").read_text(encoding="utf-8")):
            with self.subTest(name=graph["name"]):
                self.assertTrue(validate_graph(graph).valid)


class DesignerApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(router)
        cls.client = TestClient(app)

    def test_catalog_and_validation(self):
        catalog = self.client.get("/v1/designer/catalog")
        self.assertEqual(catalog.status_code, 200)
        self.assertTrue(catalog.json()["executionAvailable"])
        self.assertIn('ideal_qkd', catalog.json()['executionScopes'])
        response = self.client.post("/v1/designer/validate", json={"graph": direct()})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["valid"])

    def test_malformed_invalid_and_oversize_requests(self):
        for payload in ([], {}, {"graph": None}, {"graph": direct(), "payload": "TEST_SECRET"}):
            response = self.client.post("/v1/designer/validate", json=payload)
            self.assertEqual(response.status_code, 200)
            self.assertFalse(response.json()["valid"])
            self.assertNotIn("TEST_SECRET", response.text)
        self.assertEqual(self.client.post("/v1/designer/validate", content=b"{").status_code, 400)
        self.assertEqual(self.client.post("/v1/designer/validate", content=b" " * 2000001).status_code, 413)


if __name__ == "__main__":
    unittest.main()
