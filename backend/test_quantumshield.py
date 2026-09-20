import importlib
import sys
import types
import unittest
from unittest.mock import Mock, patch

import numpy as np

from backend.main import (
    POLICY_WEIGHTS_FILENAME,
    SimulateRequest,
    simulate,
    slice_channel_window,
)
from backend.model import (
    decrypt_message_aes_gcm,
    encrypt_message_aes_gcm,
    generate_toeplitz_seed,
    privacy_amplification,
)


class QuantumShieldCoreTests(unittest.TestCase):
    def test_all_measured_environments_produce_real_windows(self):
        means = []
        for filename in (
            "clearlowSI.csv",
            "clearhighSI.csv",
            "lightrain.csv",
        ):
            with self.subTest(filename=filename):
                window, start, dataset_size = slice_channel_window(
                    filename, 123_456, 4096
                )
                self.assertEqual(start, 123_456)
                self.assertEqual(window.size, 4096)
                self.assertEqual(dataset_size, 2**24)
                self.assertGreater(float(window.std()), 0.0)
                self.assertTrue(np.all((window >= 0.0) & (window <= 1.0)))
                means.append(round(float(window.mean()), 6))

        self.assertEqual(len(set(means)), 3)

    def test_backend_uses_new_three_environment_policy(self):
        self.assertEqual(POLICY_WEIGHTS_FILENAME, "policy.pth")

    def test_toeplitz_privacy_amplification_is_synchronized(self):
        alice = [int(index % 3 == 0) for index in range(1024)]
        bob = alice.copy()
        seed = generate_toeplitz_seed(len(alice), 512)
        alice_final = privacy_amplification(alice, 512, seed)
        bob_final = privacy_amplification(bob, 512, seed)
        self.assertEqual(alice_final, bob_final)
        self.assertEqual(len(alice_final), 512)

    def test_aes_256_gcm_round_trip_preserves_vietnamese(self):
        key_bits = [int(index % 2 == 0) for index in range(256)]
        message = "Báo cáo tài chính: lợi nhuận 600 tỷ đồng"
        aad = "QuantumShield|unicode-test"
        ciphertext, nonce, tag = encrypt_message_aes_gcm(message, key_bits, aad)
        recovered = decrypt_message_aes_gcm(
            ciphertext, nonce, tag, key_bits, aad
        )
        self.assertEqual(recovered, message)


class QuantumShieldSimulationTests(unittest.IsolatedAsyncioTestCase):
    async def test_new_policy_runs_all_three_channel_environments(self):
        for dataset in (
            "clearlowSI.csv",
            "clearhighSI.csv",
            "lightrain.csv",
        ):
            with self.subTest(dataset=dataset):
                result = await simulate(
                    SimulateRequest(
                        channel_dataset=dataset,
                        window_start=123_456,
                        sample_size=8192,
                        mode="adaptive",
                        Pt_dBm=5,
                        xi=30,
                        eve_active=False,
                    )
                )
                self.assertEqual(result.channel_dataset, dataset)
                self.assertEqual(result.model_weights, "policy.pth")
                self.assertTrue(result.accepted)
                self.assertTrue(result.integrity_verified)

    async def test_adaptive_demo_succeeds_where_low_fixed_threshold_fails(self):
        common = {
            "channel_dataset": "clearlowSI.csv",
            "window_start": 0,
            "sample_size": 8192,
            "Pt_dBm": 4.5,
            "xi": 60,
            "eve_active": False,
            "rE": 100,
        }
        fixed = await simulate(
            SimulateRequest(**common, mode="fixed", fixed_rho=0.0)
        )
        adaptive_request = SimulateRequest(**common, mode="adaptive")
        adaptive = await simulate(adaptive_request)

        self.assertFalse(fixed.accepted)
        self.assertGreaterEqual(fixed.qber, 0.11)
        self.assertTrue(adaptive.accepted)
        self.assertLess(adaptive.qber, 0.11)
        self.assertGreaterEqual(adaptive.final_key_len, 256)
        self.assertTrue(adaptive.integrity_verified)
        self.assertEqual(
            adaptive.decrypted_payload, adaptive_request.plaintext_payload
        )

    async def test_passive_eve_preserves_qber_and_reports_overlap(self):
        attacked = await simulate(
            SimulateRequest(
                channel_dataset="clearlowSI.csv",
                window_start=0,
                sample_size=8192,
                mode="adaptive",
                Pt_dBm=5,
                xi=30,
                eve_active=True,
                rE=20,
            )
        )
        clean = await simulate(SimulateRequest(channel_dataset="clearlowSI.csv", window_start=0,
                                               sample_size=8192, Pt_dBm=5, xi=30, eve_active=False))
        self.assertEqual(attacked.qber, clean.qber)
        self.assertEqual(attacked.psift, clean.psift)
        self.assertGreater(attacked.eve_interception_strength, 0.8)
        self.assertGreater(attacked.estimated_eve_information_bits, 0)
        self.assertLessEqual(attacked.final_key_len, clean.final_key_len)


class HuggingFaceEntrypointTests(unittest.TestCase):
    def test_entrypoint_reuses_api_app_and_reports_zero_gpu_startup(self):
        fake_gradio = types.ModuleType("gradio")
        fake_gradio.Textbox = Mock(side_effect=lambda **_: object())
        fake_gradio.Interface = Mock(side_effect=lambda **_: object())
        fake_gradio.mount_gradio_app = Mock(
            side_effect=lambda fastapi_app, _demo, path: fastapi_app
        )

        fake_spaces = types.ModuleType("spaces")
        fake_spaces.__path__ = []
        fake_spaces.GPU = lambda function: function
        fake_zero = types.ModuleType("spaces.zero")
        fake_zero.startup = Mock()
        fake_spaces.zero = fake_zero

        fake_uvicorn = types.ModuleType("uvicorn")
        fake_uvicorn.run = Mock()

        sys.modules.pop("backend.app", None)
        try:
            with patch.dict(
                sys.modules,
                {
                    "gradio": fake_gradio,
                    "spaces": fake_spaces,
                    "spaces.zero": fake_zero,
                    "uvicorn": fake_uvicorn,
                },
            ):
                entrypoint = importlib.import_module("backend.app")

                self.assertIs(entrypoint.app, sys.modules["backend.main"].app)
                self.assertIn(
                    "/v1/simulate",
                    {route.path for route in entrypoint.app.routes},
                )
                fake_uvicorn.run.assert_not_called()
                fake_zero.startup.assert_not_called()

                entrypoint.report_zero_gpu_startup()
                fake_zero.startup.assert_called_once_with()
        finally:
            sys.modules.pop("backend.app", None)


if __name__ == "__main__":
    unittest.main()
