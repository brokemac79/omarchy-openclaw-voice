"""Pin PulseAudio/PipeWire streams; reject observed movement to another target."""


def bind_device(element, name, Gst):
    if not isinstance(name, str) or not name or len(name) > 512:
        raise ValueError('Invalid audio device')
    element.set_property('device', name)
    props = Gst.Structure.new_empty('props')
    for key in ('node.dont-fallback', 'node.dont-move', 'node.dont-reconnect'):
        props.set_value(key, True)
    element.set_property('stream-properties', props)


def device_matches(element, name):
    current = element.get_property('current-device')
    return not current or current == name
