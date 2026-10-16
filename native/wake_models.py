"""Explicit local detector adapters. No downloads, credentials or audio devices."""
import math
import os
from pathlib import Path
import re

from wake_gate import WakeGate


def local_file(options, key, suffix):
    value = options.get(key)
    if not isinstance(value, str):
        raise ValueError('Missing local model file')
    path = Path(value)
    if not path.is_absolute() or path.suffix != suffix or not path.is_file():
        raise ValueError('Invalid local model file')
    return str(path)


def load_detector(options):
    backend = options.get('backend', 'openwakeword')
    if backend == 'openwakeword':
        paths = {key: local_file(options, key, '.onnx') for key in ('model', 'melspec', 'embedding')}
        gate = WakeGate(options.get('threshold', 0.5), options.get('consecutive', 3))
        from openwakeword.model import Model
        model = Model(wakeword_models=[paths['model']], inference_framework='onnx',
                      melspec_model_path=paths['melspec'], embedding_model_path=paths['embedding'])

        def predict(frame):
            scores = model.predict(frame)
            if len(scores) != 1:
                raise ValueError('Expected one wake phrase')
            return float(next(iter(scores.values())))
        return predict, gate

    if backend != 'sherpa-onnx':
        raise ValueError('Unknown local wake backend')
    paths = {key: local_file(options, key, '.onnx') for key in ('encoder', 'decoder', 'joiner')}
    paths['tokens'] = local_file(options, 'tokens', '.txt')
    bpe = local_file(options, 'bpe', '.model')
    phrase = options.get('phrase')
    # This adapter targets the English BPE model, with one explicit phrase.
    if not isinstance(phrase, str) or not re.fullmatch(r'[A-Za-z]+(?: [A-Za-z]+){1,4}', phrase) or len(phrase) > 64:
        raise ValueError('Choose an English wake phrase of two to five words')
    threshold = options.get('threshold', 0.25)
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not math.isfinite(threshold) or not 0 < threshold <= 1:
        raise ValueError('Invalid keyword threshold')
    if 'consecutive' in options:
        raise ValueError('Sherpa emits keyword decisions, not consecutive classifier scores')
    import numpy as np
    import sentencepiece as spm
    import sherpa_onnx
    tokenizer = spm.SentencePieceProcessor(model_file=bpe)
    pieces = tokenizer.encode(phrase.upper(), out_type=str)
    symbols = {line.rsplit(' ', 1)[0] for line in Path(paths['tokens']).read_text().splitlines()}
    if not pieces or len(pieces) > 64 or any(piece not in symbols for piece in pieces):
        raise ValueError('Phrase is incompatible with the selected token set')
    # Only tokenized configuration lives in this anonymous in-memory file.
    # The library loads it during construction; no phrase or audio file remains.
    fd = os.memfd_create('openclaw-wake-keywords', flags=os.MFD_CLOEXEC)
    try:
        keywords = (' '.join(pieces) + ' @wake\n').encode()
        if os.write(fd, keywords) != len(keywords):
            raise OSError('Could not configure keyword')
        kws = sherpa_onnx.KeywordSpotter(**paths, keywords_file=f'/proc/self/fd/{fd}',
                                        num_threads=1, keywords_threshold=threshold, provider='cpu')
    finally:
        os.close(fd)
    stream = kws.create_stream()

    def predict(frame):
        stream.accept_waveform(16000, frame.astype(np.float32) / 32768)
        detected = False
        while kws.is_ready(stream):
            kws.decode_stream(stream)
            result = kws.get_result(stream)
            if result:
                if result != 'wake':
                    raise ValueError('Unexpected keyword result')
                detected = True
                kws.reset_stream(stream)
        return float(detected)
    # KeywordSpotter already applies its own acoustic threshold and trailing
    # blank check. Treat its single terminal decision as one qualified event.
    return predict, WakeGate(consecutive=1)
