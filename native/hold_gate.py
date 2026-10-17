"""Fail-closed input lease for hold-to-talk; independent of provider turns."""
import re
import time


class HoldGate:
    LEASE_SECONDS = 0.75
    MAX_HOLD_SECONDS = 30

    def __init__(self, now=time.monotonic):
        self.now = now
        self.token = None
        self.started = self.renewed = 0
        self.retired = {}

    def expire(self):
        now = self.now()
        self.retired = {token: until for token, until in self.retired.items() if until > now}
        if self.token and (now - self.renewed >= self.LEASE_SECONDS
                           or now - self.started >= self.MAX_HOLD_SECONDS):
            self.release(self.token)
        return self.token is not None

    def release(self, token):
        if not isinstance(token, str) or not re.fullmatch('[a-f0-9]{16,32}', token):
            return False
        if token not in self.retired and len(self.retired) >= 256:
            self.token = None
            return False
        self.retired[token] = self.now() + 60
        if self.token == token:
            self.token = None
        return True

    def renew(self, token):
        self.expire()
        if not isinstance(token, str) or not re.fullmatch('[a-f0-9]{16,32}', token):
            return False
        if token in self.retired or len(self.retired) >= 256:
            return False
        if self.token and self.token != token:
            self.release(self.token)
            self.release(token)
            return False
        if self.token is None:
            self.token = token
            self.started = self.now()
        self.renewed = self.now()
        return True
