"""Generated speech in memory; eSpeak stdout never opens a playback device."""
import io
import math
import subprocess
import wave

import numpy as np
from scipy.signal import resample_poly


def speech_pcm(phrase, voice, speed, neural_voice=None):
    if neural_voice is None:
        audio = subprocess.check_output(['espeak-ng', '--stdout', '-v', voice, '-s', str(speed), phrase], timeout=10)
    else:
        from piper.config import SynthesisConfig
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav:
            neural_voice.synthesize_wav(phrase, wav, syn_config=SynthesisConfig(length_scale=175 / speed))
        audio = output.getvalue()
    with wave.open(io.BytesIO(audio)) as wav:
        assert wav.getnchannels() == 1 and wav.getsampwidth() == 2
        rate = wav.getframerate()
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2')
    divisor = math.gcd(rate, 16000)
    pcm = resample_poly(samples.astype(np.float32), 16000 // divisor, rate // divisor)
    return np.concatenate((np.zeros(32000), pcm, np.zeros(32000))).clip(-32768, 32767).astype(np.int16)
