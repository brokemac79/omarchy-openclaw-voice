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
  signal selectDestination(string id)
  signal showAnswer()
  signal showAudio()
  visible: false
  anchors { top: true; right: true }
  margins { top: 52; right: 18 }
  implicitWidth: 360
  implicitHeight: Math.min(content.implicitHeight + 28, 620, screen ? screen.height - 90 : 620)
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
    if (!["mute", "quiet", "resume-speech", "stop", "dismiss-result", "destinations"].includes(command)) return false
    execute(command)
    return true
  }
  function chooseDestination(id) {
    const destination = voiceState.destination || {};
    const choice = (voiceState.destinationChoices || []).find(value => value.id === id);
    if (!configured || busy || !current || !destination.canSwitch || destination.switching
        || !choice || choice.state !== "ready") return false
    selectDestination(id); return true
  }

  Rectangle {
    anchors.fill: parent
    radius: 14
    color: Color.notifications.background
    border.color: Color.notifications.border
    border.width: 1
    Flickable {
      id: viewport
      anchors.fill: parent
      anchors.margins: 14
      contentWidth: width
      contentHeight: content.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds
      Column {
        id: content
        width: viewport.width
        spacing: 10
        Text { text: "Voice controls"; color: Color.notifications.text; font.pixelSize: 15; font.bold: true }
        Rectangle {
          width: 154; height: 40; radius: 7
          color: Color.notifications.background; border.color: Color.notifications.border
          Text { anchors.centerIn: parent; text: "Audio setup"; color: Color.notifications.text; font.pixelSize: 13 }
          Accessible.role: Accessible.Button; Accessible.name: "Audio setup"
          Accessible.onPressAction: root.showAudio()
          MouseArea { anchors.fill: parent; onClicked: root.showAudio() }
        }
        DestinationPicker {
          width: parent.width
          destination: root.current ? root.voiceState.destination || ({}) : ({state:"stale"})
          choices: root.current ? root.voiceState.destinationChoices || [] : []
          enabled: root.configured && !root.busy
          reviewRequired: root.voiceState.reviewRequired === true
          onSelected: id => root.chooseDestination(id)
          onRefresh: root.invoke("destinations")
        }
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
        ActionCards {
          width: parent.width
          cards: root.current ? root.voiceState.actionCards || [] : []
          earlierUnknown: root.current ? root.voiceState.earlierUnknown || 0 : 0
          additionalUnknown: root.current && root.voiceState.additionalUnknown === true
        }
        Text {
          width: parent.width
          visible: !!root.voiceState.lastResult
          text: "Last received text (not proof of action completion):\n" + (root.voiceState.lastResult || "")
          textFormat: Text.PlainText; wrapMode: Text.WordWrap
          maximumLineCount: 6; elide: Text.ElideRight
          color: Color.notifications.text; font.pixelSize: 13
        }
        Rectangle {
          width: 154; height: 40; radius: 7
          visible: root.current && !!(root.voiceState.answer && root.voiceState.answer.text)
          color: Color.notifications.background; border.color: Color.notifications.border
          Text { anchors.centerIn: parent; text: "Open answer"; color: Color.notifications.text; font.pixelSize: 13 }
          Accessible.role: Accessible.Button; Accessible.name: "Open answer"
          Accessible.onPressAction: root.showAnswer()
          MouseArea { anchors.fill: parent; onClicked: root.showAnswer() }
        }
        Row {
          spacing: 18
          Text {
            visible: root.voiceState.reviewRequired === true || !!root.voiceState.lastResult || (root.voiceState.actionCards || []).length > 0 || root.voiceState.earlierUnknown > 0 || root.voiceState.additionalUnknown === true
            text: "Dismiss results"; color: Color.notifications.text; font.pixelSize: 12
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
    Rectangle {
      anchors.right: parent.right
      anchors.rightMargin: 5
      y: 14 + Math.max(0, Math.min(1, viewport.visibleArea.yPosition)) * viewport.height
      width: 3
      height: viewport.height * Math.min(1, viewport.visibleArea.heightRatio)
      radius: 2
      visible: viewport.contentHeight > viewport.height
      color: Color.accent
      opacity: 0.6
    }
  }
}
