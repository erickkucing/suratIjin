import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

import main

class TestDeviceDetectionAndFallback(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def test_detect_device_capabilities_structure(self):
        """Verify device capability detection returns all expected keys and valid types."""
        caps = main.detect_device_capabilities()
        self.assertIn("cuda_available", caps)
        self.assertIn("device_count", caps)
        self.assertIn("device_name", caps)
        self.assertIn("can_use_gpu", caps)
        self.assertIsInstance(caps["cuda_available"], bool)
        self.assertIsInstance(caps["device_count"], int)
        self.assertIsInstance(caps["device_name"], str)
        self.assertIsInstance(caps["can_use_gpu"], bool)

    def test_health_check_endpoint(self):
        """Verify /health exposes device, cuda_available, and device_name."""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("device", data)
        self.assertIn("cuda_available", data)
        self.assertIn("device_name", data)
        self.assertIn(data["device"], ["cpu", "gpu"])

    def test_switch_to_cpu(self):
        """Verify switch_to_cpu correctly resets state and loads CPU engine."""
        main._active_device = "gpu"
        main._device_name = "Mock GPU"
        engine = main.switch_to_cpu()
        self.assertIsNotNone(engine)
        self.assertEqual(main._active_device, "cpu")
        self.assertIn("CPU", main._device_name)

    @patch("main.PaddleOCR")
    @patch("main.paddle.set_device")
    @patch("main.detect_device_capabilities")
    def test_gpu_initialization_success(self, mock_caps, mock_set_dev, mock_ocr_cls):
        """Verify get_ocr_engine prioritizes GPU when CUDA GPU is detected."""
        mock_caps.return_value = {
            "cuda_available": True,
            "device_count": 1,
            "device_name": "NVIDIA GeForce RTX 4090",
            "can_use_gpu": True
        }
        mock_instance = MagicMock()
        mock_ocr_cls.return_value = mock_instance

        # Reset global state
        main._ocr_engine = None
        main._active_device = "cpu"

        engine = main.get_ocr_engine()
        self.assertEqual(engine, mock_instance)
        self.assertEqual(main._active_device, "gpu")
        self.assertEqual(main._device_name, "NVIDIA GeForce RTX 4090")
        mock_set_dev.assert_called_with("gpu")
        mock_ocr_cls.assert_called_with(use_angle_cls=False, lang="en", show_log=False, use_gpu=True, rec_batch_num=32, ir_optim=False)

    @patch("main.PaddleOCR")
    @patch("main.paddle.set_device")
    @patch("main.detect_device_capabilities")
    def test_gpu_initialization_fallback_on_error(self, mock_caps, mock_set_dev, mock_ocr_cls):
        """Verify get_ocr_engine falls back to CPU if GPU init raises an exception."""
        mock_caps.return_value = {
            "cuda_available": True,
            "device_count": 1,
            "device_name": "NVIDIA GeForce RTX 4090",
            "can_use_gpu": True
        }

        # First call (GPU) raises CUDA error, second call (CPU fallback) succeeds
        cpu_instance = MagicMock()
        mock_ocr_cls.side_effect = [RuntimeError("CUDA out of memory or driver failure"), cpu_instance]

        # Reset global state
        main._ocr_engine = None
        main._active_device = "gpu"

        engine = main.get_ocr_engine()
        self.assertEqual(engine, cpu_instance)
        self.assertEqual(main._active_device, "cpu")
        self.assertIn("CPU", main._device_name)

    def test_prewarm_ocr_engine(self):
        """Verify prewarm_ocr_engine executes dummy forward pass without error."""
        mock_engine = MagicMock()
        mock_engine.ocr.return_value = []
        main.prewarm_ocr_engine(mock_engine)
        self.assertTrue(mock_engine.ocr.called)

if __name__ == "__main__":
    unittest.main()
