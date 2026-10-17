// Copyright (c) 2026 brokemac79
// SPDX-License-Identifier: MIT
import QtQuick
import QtQuick.Controls as Controls
import Quickshell
import Quickshell.Wayland
import qs.Commons

PanelWindow {
  id: root
  property var voiceState: ({})
  property bool current: false
  property bool configured: false
  property bool busy: false
  property string pressToken: ""
  property string pressSource: ""
  property double pressedAt: 0
  property alias holdButton: button
  property alias holdArea: holdArea
  property alias closeControl: closeButton
  property alias focusArea: focusArea
  signal command(string operation, string token)
  signal endVoice()
  readonly property var hold: voiceState.hold || ({})
  readonly property bool held: pressToken !== ""
  readonly property bool canBegin: configured && current && !busy && !!voiceState.hold
    && (!hold.held || held)
    && !(voiceState.audio && voiceState.audio.occupied)
    && (hold.mode || (!voiceState.callRequested && !voiceState.reviewRequired
      && !["standby", "preparing", "connecting", "stopping"].includes(voiceState.status)))
  function begin(source) {
    if (held) {
      if (pressSource !== source) release();
      return false;
    }
    if (!canBegin) return false;
    pressToken = Date.now().toString(16) + Math.random().toString(16).slice(2, 15).padEnd(13, "0");
    pressSource = source; pressedAt = Date.now();
    command("hold-start", pressToken); return true;
  }
  function release(source) {
    if (!held || (source && source !== pressSource)) return;
    const token = pressToken;
    pressToken = ""; pressSource = "";
    command("hold-release", token);
  }
  function releasePanel() { if (pressSource !== "shortcut") release(); }
  visible: false
  anchors { top: true; right: true }
  margins { top: 52; right: 18 }
  implicitWidth: Math.min(420, screen ? screen.width - 36 : 420)
  implicitHeight: Math.min(470, screen ? screen.height - 90 : 470)
  color: "transparent"
  exclusionMode: ExclusionMode.Ignore
  WlrLayershell.layer: WlrLayer.Overlay
  WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
  WlrLayershell.namespace: "openclaw-voice-hold"
  onVisibleChanged: {
    if (visible) Qt.callLater(() => focusArea.forceActiveFocus());
    else releasePanel();
  }
  onCurrentChanged: if (!current) release()
  onConfiguredChanged: if (!configured) release()
  Component.onDestruction: release()
  Timer {
    interval: 200; running: root.held; repeat: true
    onTriggered: {
      if (!root.current || !root.configured || Date.now() - root.pressedAt >= 30000) root.release();
      else root.command("hold-renew", root.pressToken);
    }
  }
  Shortcut { sequence: "Escape"; enabled: root.visible; onActivated: root.visible = false }
  Rectangle {
    anchors.fill: parent; radius: 14
    color: Color.notifications.background; border.color: Color.notifications.border
    FocusScope {
      id: focusArea
      anchors.fill: parent; focus: true
      onActiveFocusChanged: if (!activeFocus) root.releasePanel()
      Keys.onPressed: event => {
        if (event.key === Qt.Key_Space) {
          event.accepted = true;
          if (!event.isAutoRepeat) root.begin("keyboard");
        }
      }
      Keys.onReleased: event => {
        if (event.key === Qt.Key_Space) {
          event.accepted = true;
          if (!event.isAutoRepeat) root.release("keyboard");
        }
      }
      Flickable {
        anchors { left: parent.left; right: parent.right; top: parent.top; bottom: footer.top; margins: 14 }
        contentWidth: width; contentHeight: content.implicitHeight; clip: true
        boundsBehavior: Flickable.StopAtBounds
        Controls.ScrollBar.vertical: Controls.ScrollBar {}
        Column {
          id: content
          width: parent.width - 12; spacing: 12
          Text { text: "Hold to talk"; color: Color.notifications.text; font.pixelSize: 18; font.bold: true }
          Text {
            width: parent.width
            text: !root.current ? "Voice state unavailable. Use End voice."
              : root.hold.message || (root.held ? root.hold.ready ? "Ready — Speak now" : "Preparing — wait for Ready before speaking"
                : root.hold.mode ? voiceState.inputMuted ? "Input muted. Hold again for a follow-up." : "Muting input — wait."
                  : "End conversation or standby, then review and dismiss retained results before changing modes.")
            textFormat: Text.PlainText; wrapMode: Text.Wrap
            color: Color.notifications.text; font.pixelSize: 14
          }
          Rectangle {
            id: button
            width: parent.width; height: 90; radius: 10
            color: root.held && root.hold.ready ? Color.accent : Color.notifications.background
            border.color: focusArea.activeFocus ? Color.accent : Color.notifications.border
            opacity: root.canBegin || root.held ? 1 : 0.45
            Accessible.role: Accessible.Button; Accessible.name: "Press and hold to talk, or hold Space"
            Text {
              anchors.centerIn: parent
              text: root.held ? root.hold.ready ? "Speak now · Release to stop input" : "Preparing…" : "Press and hold · Space"
              color: Color.notifications.text; font.pixelSize: 14
            }
            MouseArea {
              id: holdArea
              anchors.fill: parent
              onPressed: { focusArea.forceActiveFocus(); root.begin("touch") }
              onReleased: root.release("touch")
              onCanceled: root.release("touch")
            }
          }
          Text {
            width: parent.width
            text: root.hold.releaseBehavior === "end"
              ? "Release ends voice, including playback. Submitted work may continue."
              : "Release mutes transmission; capture remains open and the reply can continue. Use End voice to release audio."
            textFormat: Text.PlainText; wrapMode: Text.Wrap
            color: Color.notifications.text; font.pixelSize: 13
          }
          Text {
            width: parent.width
            text: "No pre-roll. Release is not an exact request submission, cancellation or completion signal. Each hold is limited to 30 seconds."
            textFormat: Text.PlainText; wrapMode: Text.Wrap
            color: Color.notifications.text; font.pixelSize: 12
          }
        }
      }
      Row {
        id: footer
        anchors { left: parent.left; bottom: parent.bottom; margins: 14 }
        spacing: 12
        Controls.Button { text: "End voice"; implicitHeight: 44; onClicked: { root.release(); root.endVoice() } }
        Controls.Button { id: closeButton; text: "Close"; implicitHeight: 44; onClicked: root.visible = false }
      }
    }
  }
}
