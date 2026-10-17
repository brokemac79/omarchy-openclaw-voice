import unittest
from native.hold_gate import HoldGate


class HoldGateTests(unittest.TestCase):
    def setUp(self):
        self.clock = 0
        self.gate = HoldGate(lambda: self.clock)
        self.first, self.second = 'a' * 16, 'b' * 16

    def test_release_before_start_and_late_renew_never_open_input(self):
        self.assertTrue(self.gate.release(self.first))
        self.assertFalse(self.gate.renew(self.first))
        self.assertFalse(self.gate.expire())

    def test_lost_release_expires_and_repeat_cannot_reopen(self):
        self.assertTrue(self.gate.renew(self.first))
        self.clock = 0.74
        self.assertTrue(self.gate.expire())
        self.clock = 0.75
        self.assertFalse(self.gate.expire())
        self.assertFalse(self.gate.renew(self.first))
        self.assertTrue(self.gate.renew(self.second))

    def test_continuous_renewals_cannot_extend_maximum_hold(self):
        for step in range(120):
            self.clock = step / 4
            self.assertTrue(self.gate.renew(self.first))
        self.clock = 30
        self.assertFalse(self.gate.renew(self.first))
        self.assertFalse(self.gate.expire())

    def test_overlapping_owners_close_both_and_old_release_is_harmless(self):
        self.assertTrue(self.gate.renew(self.first))
        self.assertFalse(self.gate.renew(self.second))
        self.assertFalse(self.gate.expire())
        self.assertFalse(self.gate.renew(self.first))
        self.assertFalse(self.gate.renew(self.second))
        third = 'c' * 16
        self.assertTrue(self.gate.renew(third))
        self.gate.release(self.first)
        self.assertEqual(self.gate.token, third)

    def test_invalid_tokens_and_bounded_tombstones_fail_closed(self):
        for token in (None, '', 'x' * 16, 'a' * 33):
            self.assertFalse(self.gate.renew(token))
        for value in range(256):
            self.gate.release(f'{value:016x}')
        self.assertFalse(self.gate.renew('f' * 16))
        self.clock = 61
        self.assertTrue(self.gate.renew('f' * 16))
