"""Actual hold transmission and continuing playback, using generated WebRTC."""
from native_audio import prove_media, prove_eof

prove_media(hold=True)
prove_eof()
