import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
from wake_gate import WakeGate


class WakeGateTests(unittest.TestCase):
    def test_generated_silence_and_tone_with_fake_scores(self):
        silence = [0] * 1280
        tone = [int(8000 * math.sin(2 * math.pi * 440 * n / 16000)) for n in range(1280)]
        gate = WakeGate()
        for _ in range(25):
            self.assertFalse(gate.accept(1.0, True))  # settling after playback
        for _ in range(100):
            self.assertFalse(gate.accept(1.0, max(map(abs, silence)) > 100))
        self.assertFalse(gate.accept(0.9, True))
        self.assertFalse(gate.accept(0.1, True))  # miss resets consecutive hits
        audible = max(map(abs, tone)) > 100
        self.assertFalse(gate.accept(0.9, audible))
        self.assertFalse(gate.accept(0.9, audible))
        self.assertTrue(gate.accept(0.9, audible))
        for _ in range(100):
            self.assertFalse(gate.accept(1, True))  # one wake per acquired worker

    def test_invalid_configuration_and_scores_fail_closed(self):
        for threshold in (0, 2, float('nan'), True, '0.5'):
            with self.assertRaises(ValueError):
                WakeGate(threshold=threshold)
        for count in (0, 11, 1.5, True):
            with self.assertRaises(ValueError):
                WakeGate(consecutive=count)
        for score in (-1, 2, float('inf'), float('nan')):
            with self.assertRaises(ValueError):
                WakeGate().accept(score, True)

    def test_delayed_prediction_after_speech_uses_only_bounded_activity(self):
        gate = WakeGate(settle_frames=0)
        self.assertFalse(gate.accept(0.1, True))
        self.assertFalse(gate.accept(0.9, False))
        self.assertFalse(gate.accept(0.9, False))
        self.assertTrue(gate.accept(0.9, False))
        self.assertFalse(gate.accept(0.9, False))

        stale = WakeGate(settle_frames=0)
        self.assertFalse(stale.accept(0.1, True))
        for _ in range(12):
            self.assertFalse(stale.accept(0.1, False))
        for _ in range(100):
            self.assertFalse(stale.accept(0.9, False))

    def test_settling_audio_cannot_arm_a_later_silent_prediction(self):
        gate = WakeGate(settle_frames=1)
        self.assertFalse(gate.accept(0.9, True))
        for _ in range(100):
            self.assertFalse(gate.accept(0.9, False))
