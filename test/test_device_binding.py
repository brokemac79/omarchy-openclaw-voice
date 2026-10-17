import unittest
from native.device_binding import bind_device, device_matches


class DeviceBindingTests(unittest.TestCase):
    def test_pins_device_and_requests_no_move_fallback_or_reconnect_without_opening_it(self):
        class Structure:
            @staticmethod
            def new_empty(_name):
                return Structure()

            def set_value(self, key, value):
                setattr(self, key, value)

        class Gst:
            pass

        Gst.Structure = Structure

        class Element:
            def __init__(self):
                self.properties = {}

            def set_property(self, key, value):
                self.properties[key] = value

            def get_property(self, key):
                return self.properties.get(key, '')

        element = Element()
        bind_device(element, 'fixture-speaker', Gst)
        self.assertEqual(element.properties['device'], 'fixture-speaker')
        for key in ('node.dont-fallback', 'node.dont-move', 'node.dont-reconnect'):
            self.assertIs(getattr(element.properties['stream-properties'], key), True)
        self.assertTrue(device_matches(element, 'fixture-speaker'))
        element.properties['current-device'] = 'fixture-speaker'
        self.assertTrue(device_matches(element, 'fixture-speaker'))
        element.properties['current-device'] = 'fixture-other'
        self.assertFalse(device_matches(element, 'fixture-speaker'))
        for value in (None, '', 'x' * 513):
            with self.assertRaises(ValueError):
                bind_device(element, value, Gst)
