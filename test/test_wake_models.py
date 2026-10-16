"""Fail-closed model configuration before any optional runtime or microphone."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
from wake_models import load_detector


class WakeModelConfigurationTests(unittest.TestCase):
    def test_unknown_backend_and_missing_assets_fail_before_runtime_import(self):
        for options in ({'backend': 'unknown'}, {'backend': ''}, {}, {'backend': 'sherpa-onnx'}):
            with self.assertRaises(ValueError):
                load_detector(options)

    def test_sherpa_rejects_phrase_injection_and_wrong_gate_options_before_inference(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            options = {'backend': 'sherpa-onnx', 'phrase': 'Hey Open Claw'}
            for name, suffix in [('encoder', '.onnx'), ('decoder', '.onnx'), ('joiner', '.onnx'),
                                 ('tokens', '.txt'), ('bpe', '.model')]:
                path = root / (name + suffix); path.touch(); options[name] = str(path.resolve())
            for phrase in ('', 'wake', 'Hey Open Claw\n@other', 'Hey Open Claw/other', 'one two three four five six'):
                with self.subTest(phrase=phrase), self.assertRaises(ValueError):
                    load_detector({**options, 'phrase': phrase})
            for threshold in (True, 0, 2, float('nan')):
                with self.subTest(threshold=threshold), self.assertRaises(ValueError):
                    load_detector({**options, 'threshold': threshold})
            with self.assertRaises(ValueError):
                load_detector({**options, 'consecutive': 3})
