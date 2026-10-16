"""Fail-closed model configuration before any optional runtime or microphone."""
from pathlib import Path
import os
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
from wake_models import load_detector, sherpa_phrases


class WakeModelConfigurationTests(unittest.TestCase):
    def test_openclaw_trigger_accepts_both_word_boundaries_with_hey_required(self):
        for phrase in ('Hey Open Claw', 'Hey OpenClaw', 'hey openclaw'):
            self.assertEqual(sherpa_phrases(phrase), ('Hey Open Claw', 'Hey OpenClaw'))
        self.assertEqual(sherpa_phrases('Hello computer'), ('Hello computer',))
        with self.assertRaises(ValueError):
            sherpa_phrases('OpenClaw')

    @unittest.skipUnless(hasattr(os, 'memfd_create'), 'Linux keyword configuration')
    def test_both_keyword_paths_feed_one_gate_and_unknown_results_fail_closed(self):
        captured = {}
        class Stream:
            def accept_waveform(self, rate, samples):
                self.pending = True
        class Spotter:
            def __init__(self, **options):
                captured['keywords'] = Path(options['keywords_file']).read_text()
                captured['spotter'] = self
                self.result = 'wake0'
            def create_stream(self):
                return Stream()
            def is_ready(self, stream):
                return stream.pending
            def decode_stream(self, stream):
                stream.pending = False
            def get_result(self, stream):
                return self.result
            def reset_stream(self, stream):
                pass
        class Frame:
            def astype(self, dtype):
                return self
            def __truediv__(self, divisor):
                return [0.0]
        tokenizer = SimpleNamespace(encode=lambda phrase, out_type: ['HEY', 'OPEN', 'CLAW'] if 'OPEN CLAW' in phrase else ['HEY', 'OPENCLAW'])
        modules = {'numpy': SimpleNamespace(float32=float),
                   'sentencepiece': SimpleNamespace(SentencePieceProcessor=lambda **_: tokenizer),
                   'sherpa_onnx': SimpleNamespace(KeywordSpotter=Spotter)}
        with tempfile.TemporaryDirectory() as directory, patch.dict(sys.modules, modules):
            root = Path(directory)
            options = {'backend': 'sherpa-onnx', 'phrase': 'Hey OpenClaw'}
            for name, suffix in [('encoder', '.onnx'), ('decoder', '.onnx'), ('joiner', '.onnx'), ('tokens', '.txt'), ('bpe', '.model')]:
                path = root / (name + suffix)
                path.write_text('HEY 0\nOPEN 1\nCLAW 2\nOPENCLAW 3\n' if name == 'tokens' else '')
                options[name] = str(path.resolve())
            predict, gate = load_detector(options)
            self.assertEqual(captured['keywords'], 'HEY OPEN CLAW @wake0\nHEY OPENCLAW @wake1\n')
            for _ in range(25):
                gate.accept(0, False)
            self.assertTrue(gate.accept(predict(Frame()), True))
            captured['spotter'].result = 'wake1'
            self.assertEqual(predict(Frame()), 1.0)
            self.assertFalse(gate.accept(1, True))
            captured['spotter'].result = 'unknown'
            with self.assertRaises(ValueError):
                predict(Frame())

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
