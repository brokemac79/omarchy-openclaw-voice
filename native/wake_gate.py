"""Bounded local wake decision logic; independent of audio devices and models."""
import math


class WakeGate:
    def __init__(self, threshold=0.5, consecutive=3, settle_frames=25):
        if (isinstance(threshold, bool) or not isinstance(threshold, (int, float))
                or not math.isfinite(threshold) or not 0 < threshold <= 1):
            raise ValueError('Invalid threshold')
        if type(consecutive) is not int or not 1 <= consecutive <= 10:
            raise ValueError('Invalid consecutive frame count')
        self.threshold, self.required = threshold, consecutive
        self.settle, self.count, self.fired = settle_frames, 0, False
        # Classifiers use preceding speech context: their score can peak after
        # the final phoneme, in a quiet frame. Retain activity, never PCM, for
        # at most 12 x 80 ms. Silence since arming cannot create this activity.
        self.recent_audio = 0

    def accept(self, score, audible):
        if not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError('Invalid model score')
        if self.fired:
            return False
        if self.settle > 0:
            self.settle -= 1
            return False
        self.recent_audio = 12 if audible else max(0, self.recent_audio - 1)
        self.count = self.count + 1 if self.recent_audio > 0 and score >= self.threshold else 0
        if self.count >= self.required:
            self.fired = True
            return True
        return False
