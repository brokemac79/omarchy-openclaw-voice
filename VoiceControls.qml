import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons

// Deliberately opened from the bar. Closing this panel never changes audio.
PanelWindow {
  id: root
  property var voiceState: ({})
  property bool current: false
  property bool configured: false
  property bool busy: false
  signal execute(string command)
  visible: false
  anchors { top: true; right: true }
  margins { top: 52; right: 18 }
  implicitWidth: 360
  implicitHeight: content.implicitHeight + 28
  color: "transparent"
  exclusionMode: ExclusionMode.Ignore
  WlrLayershell.layer: WlrLayer.Overlay
  WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
  WlrLayershell.namespace: "openclaw-voice-controls"

  readonly property bool inCall: current && voiceState.callRequested === true
  readonly property bool inputPending: voiceState.inputMuteRequested !== voiceState.inputMuted
  readonly property bool outputPending: voiceState.speechQuietRequested !== voiceState.speechQuiet
  function invoke(command) {
    if (!configured || busy) return false
    if (command === "mute" && (!inCall || inputPending)) return false
    if (["quiet", "resume-speech"].includes(command) && (!inCall || outputPending)) return false
    if (!["mute", "quiet", "resume-speech", "stop", "dismiss-result"].includes(command)) return false
    execute(command)
    return true
  }

  Rectangle {
    anchors.fill: parent
    radius: 14
    color: Color.notifications.background
    border.color: Color.notifications.border
    border.width: 1
    Column {
      id: content
      anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
      spacing: 10
      Text { text: "Voice controls"; color: Color.notifications.text; font.pixelSize: 15; font.bold: true }
      Text {
        width: parent.width
        text: root.current ? (root.voiceState.text || "Microphone off") : "Audio state unknown — use End voice"
        textFormat: Text.PlainText; wrapMode: Text.WordWrap
        color: Color.notifications.text; font.pixelSize: 13
      }
      Text {
        width: parent.width
        visible: root.current && !!root.voiceState.recoveryAction
        text: root.voiceState.recoveryAction || ""
        textFormat: Text.PlainText; wrapMode: Text.WordWrap
        color: Color.notifications.text; font.pixelSize: 12
      }
      Flow {
        width: parent.width
        spacing: 8
        Repeater {
          model: [
            {label: root.inputPending ? "Updating input…" : root.voiceState.inputMuted ? "Unmute input" : "Mute input", command: "mute", available: root.inCall && !root.inputPending},
            {label: root.outputPending ? "Updating speech…" : root.voiceState.speechQuiet ? "Resume speech" : "Quiet", command: root.voiceState.speechQuiet ? "resume-speech" : "quiet", available: root.inCall && !root.outputPending},
            {label: "Cancel request", command: "cancel-request", available: false},
            {label: "End voice", command: "stop", available: true}
          ]
          delegate: Rectangle {
            required property var modelData
            width: 154; height: 36; radius: 7
            opacity: enabled ? 1 : 0.45
            enabled: root.configured && !root.busy && modelData.available
            color: Color.notifications.background
            border.color: Color.notifications.border
            Text { anchors.centerIn: parent; text: parent.modelData.label; color: Color.notifications.text; font.pixelSize: 13 }
            Accessible.role: Accessible.Button
            Accessible.name: modelData.label
            Accessible.onPressAction: root.invoke(modelData.command)
            MouseArea { anchors.fill: parent; onClicked: root.invoke(parent.modelData.command) }
          }
        }
      }
      Text {
        width: parent.width
        text: "Quiet silences speech until you resume it. Input mute is separate. Neither Quiet nor End voice cancels submitted work."
        textFormat: Text.PlainText; wrapMode: Text.WordWrap
        color: Color.notifications.text; font.pixelSize: 12
      }
      Text {
        width: parent.width
        text: "Work status unknown. Cancel request is unavailable for this connection. During Talk, say ‘cancel’ and check OpenClaw’s response. Cancellation cannot undo completed actions."
        textFormat: Text.PlainText; wrapMode: Text.WordWrap
        color: Color.notifications.text; font.pixelSize: 12
      }
      Text {
        width: parent.width
        visible: !!root.voiceState.lastResult
        text: "Last received text (not proof of action completion):\n" + (root.voiceState.lastResult || "")
        textFormat: Text.PlainText; wrapMode: Text.WordWrap
        maximumLineCount: 6; elide: Text.ElideRight
        color: Color.notifications.text; font.pixelSize: 13
      }
      Row {
        spacing: 18
        Text {
          visible: !!root.voiceState.lastResult
          text: "Dismiss text"; color: Color.notifications.text; font.pixelSize: 12
          Accessible.role: Accessible.Button; Accessible.name: text
          Accessible.onPressAction: root.invoke("dismiss-result")
          MouseArea { anchors.fill: parent; onClicked: root.invoke("dismiss-result") }
        }
        Text {
          text: "Close controls"; color: Color.notifications.text; font.pixelSize: 12
          Accessible.role: Accessible.Button; Accessible.name: text
          Accessible.onPressAction: root.visible = false
          MouseArea { anchors.fill: parent; onClicked: root.visible = false }
        }
      }
    }
  }
}
