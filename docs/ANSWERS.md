# Read a received answer

Right-click the bar icon and choose **Open answer** after reply text
arrives. The reader opens deliberately and takes keyboard focus. Compact speech
bubbles keep their existing click-through behaviour. Closing the reader, including
with Escape, does not start, stop or mute audio.

The panel shows the selected agent and conversation context. Scroll to read,
drag to select text, and use **Copy all** or **Copy selection**. Ctrl+A and Ctrl+C
also work in the text. **A−** and **A+** adjust the reader's text size between 12
and 24 pixels for the current shell session. Controls wrap on narrow displays
and remain outside the scrolling reply.

Text, including HTML-looking content and Markdown fences, is displayed literally
in a wrapping monospace font. Multiline code preserves its text and indentation;
there is no code execution or rendered HTML. A separate list offers up to twelve
deduplicated HTTP/HTTPS links found in the received text. Only an explicit link
activation opens the system URL handler. Other schemes, credentials in URLs,
escaped hosts, control characters and URLs over 2,048 units are rejected. This
scheme check does not establish that a web page is trustworthy.

## Received text and limits

The reader keeps the beginning of one reply, up to 65,536 UTF-16 code units
(fewer characters when surrogate pairs are used). Overflow is labelled
**Truncated**; it never silently replaces the beginning with a tail.
The cap does not split a surrogate pair. Streaming fragments append, and a final
text event replaces them with the received final version. Compact captions keep
their separate 1,800-unit tail limit.

Partial text is labelled partial, including after an audio failure or End voice.
A final text event means that reply text was received, not that host work
completed. The reader cannot recover a backend result that never reached this
client, or text already discarded by an older companion.

The most recent received answer remains until another reply replaces it,
**Dismiss results** clears it, a new call starts, or the companion shuts down.
End voice and delivery failures preserve it under its original destination.
Existing result-review guards still prevent switching destinations until the
user ends voice and dismisses results. Stale or missing companion state hides
the reader's text and disables its copy/link operations.

## Privacy and validation

The answer is bounded volatile state in the existing private runtime file,
not persistent transcript history. There are no recordings or automatic
clipboard writes. Explicit copying leaves text in the desktop clipboard, where
other applications or a configured clipboard manager may retain it. Dismissing
the answer does not clear a copy the user has made. General diagnostics exclude
reply content. Gateway permissions, approvals and speech providers are unchanged.

Run the Node suite for buffering, final replacements, overflow, Unicode,
retention, clearing and link filtering. Run `python3 test/qml_answers.py` in an
Omarchy graphical session with `wl-copy`, `wl-paste`, `wtype` and QtTest available.
It feeds synthetic owner state into actual components, checks pointer selection,
simulated touch sizing/Close, real keyboard copy/Escape, clipboard actions,
short-screen scrolling, safe-link signals and clearing/stale boundaries.
Clipboard data is restored from memory and is never logged or saved. The fixture
uses fake controls and never launches a URL, opens audio or contacts a provider.
These checks do not establish physical touchscreen or live speech behaviour.
