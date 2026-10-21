// Copyright (c) 2026 brokemac79
// SPDX-License-Identifier: MIT
import QtQuick
import QtQuick.Controls as Controls
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons

PanelWindow {
  id: root
  property var voiceState: ({})
  property bool current: false
  property bool configured: false
  property bool busy: false
  property bool opened: false
  property alias inputSelector: inputChoice
  property alias outputSelector: outputChoice
  property alias viewport: viewport
  property alias playControl: playButton
  property alias stopControl: stopButton
  property alias closeControl: closeButton
  signal execute(string command)
  signal selectDevice(string kind, string id)
  signal stopCheck
  readonly property var audio: current ? voiceState.audio || ({}) : ({})
  readonly property var check: audio.check || ({
      phase: "idle"
    })
  readonly property bool checking: ["starting", "checking", "stopping"].includes(check.phase)
  function choose(kind, index) {
    const rows = kind === "input" ? audio.inputs || [] : audio.outputs || [], row = rows[index];
    if (!configured || busy || !current || !audio.canSelect || !row || !row.available)
      return false;
    selectDevice(kind, row.id);
    return true;
  }
  function invoke(command) {
    if (command === "audio-stop-check") {
      stopCheck();
      return true;
    }
    if (!configured || busy || !current)
      return false;
    if (command === "audio-devices") {
      execute(command);
      return true;
    }
    if (!audio.canSelect)
      return false;
    if (command === "audio-speaker-check" && !audio.outputAvailable)
      return false;
    if (command !== "audio-speaker-check")
      return false;
    execute(command);
    return true;
  }
  component ActionButton: Controls.Button {
    padding: 10
    implicitHeight: Math.max(40, contentItem.implicitHeight + 16)
    font.pixelSize: 13
    opacity: enabled ? 1 : 0.45
    background: Rectangle {
      radius: 7
      color: parent.down ? Commons.Color.accent : Commons.Color.notifications.background
      border.color: parent.activeFocus ? Commons.Color.accent : Commons.Color.notifications.border
    }
    contentItem: Text {
      text: parent.text
      textFormat: Text.PlainText
      font: parent.font
      color: Commons.Color.notifications.text
      horizontalAlignment: Text.AlignHCenter
      verticalAlignment: Text.AlignVCenter
    }
  }
  component DeviceChoice: Controls.ComboBox {
    id: choice
    property string kind
    property bool available: false
    width: parent.width
    implicitHeight: 48
    enabled: root.current && root.configured && !root.busy && root.audio.canSelect === true
    textRole: "label"
    model: kind === "input" ? root.audio.inputs || [] : root.audio.outputs || []
    currentIndex: model.findIndex(row => row.id === (kind === "input" ? root.audio.inputId : root.audio.outputId))
    displayText: (available ? "" : "Unavailable · ") + (currentIndex >= 0 ? model[currentIndex].label : "Select a device")
    Accessible.name: kind === "input" ? "Microphone device" : "Speaker device"
    indicator: Text {
      x: choice.width - width - 10
      y: (choice.height - height) / 2
      text: "▾"
      color: Commons.Color.notifications.text
      font.pixelSize: 16
    }
    background: Rectangle {
      radius: 7
      color: Commons.Color.notifications.background
      border.color: choice.activeFocus ? Commons.Color.accent : Commons.Color.notifications.border
    }
    contentItem: Text {
      text: choice.displayText
      textFormat: Text.PlainText
      color: Commons.Color.notifications.text
      font.pixelSize: 13
      elide: Text.ElideRight
      verticalAlignment: Text.AlignVCenter
      leftPadding: 8
      rightPadding: 24
    }
    delegate: Controls.ItemDelegate {
      required property var modelData
      width: choice.width
      enabled: modelData.available
      contentItem: Text {
        text: modelData.label + "\n" + modelData.detail
        textFormat: Text.PlainText
        wrapMode: Text.Wrap
        color: Commons.Color.notifications.text
        font.pixelSize: 12
      }
      background: Rectangle {
        color: parent.highlighted ? Commons.Color.accent : Commons.Color.notifications.background
      }
    }
    onActivated: index => root.choose(kind, index)
  }
  visible: false
  anchors {
    top: true
    right: true
  }
  margins {
    top: 52
    right: 18
  }
  implicitWidth: Math.min(520, screen ? screen.width - 36 : 520)
  implicitHeight: Math.min(620, screen ? screen.height - 90 : 620)
  color: "transparent"
  exclusionMode: ExclusionMode.Ignore
  WlrLayershell.layer: WlrLayer.Overlay
  WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
  WlrLayershell.namespace: "openclaw-voice-audio"
  onVisibleChanged: {
    if (visible) {
      opened = true;
      invoke("audio-devices");
      Qt.callLater(() => closeButton.forceActiveFocus());
    } else if (opened)
      stopCheck();
  }
  Shortcut {
    sequence: "Escape"
    enabled: root.visible
    onActivated: root.visible = false
  }
  Rectangle {
    anchors.fill: parent
    radius: 14
    color: Commons.Color.notifications.background
    border.color: Commons.Color.notifications.border
    Text {
      id: title
      anchors {
        top: parent.top
        left: parent.left
        margins: 14
      }
      text: "Audio setup"
      font.pixelSize: 17
      font.bold: true
      color: Commons.Color.notifications.text
    }
    Flickable {
      id: viewport
      anchors {
        left: parent.left
        right: parent.right
        top: title.bottom
        bottom: footer.top
        margins: 14
      }
      clip: true
      contentWidth: width
      contentHeight: content.implicitHeight
      boundsBehavior: Flickable.StopAtBounds
      Controls.ScrollBar.vertical: Controls.ScrollBar {}
      Column {
        id: content
        width: viewport.width - 14
        spacing: 10
        Text {
          width: parent.width
          text: !root.current ? "Companion state unavailable. Stop any check before retrying." : root.audio.message || "Select devices only after ending voice and standby. Checks are local and never send speech."
          textFormat: Text.PlainText
          wrapMode: Text.Wrap
          color: Commons.Color.notifications.text
          font.pixelSize: 13
        }
        ActionButton {
          text: "Refresh devices"
          enabled: root.current && root.configured && !root.busy
          onClicked: root.invoke("audio-devices")
        }
        Text {
          text: "Microphone"
          font.pixelSize: 14
          color: Commons.Color.notifications.text
        }
        DeviceChoice {
          id: inputChoice
          kind: "input"
          available: root.audio.inputAvailable === true
        }
        Text {
          width: parent.width
          text: inputChoice.currentIndex >= 0 ? inputChoice.model[inputChoice.currentIndex].detail : ""
          textFormat: Text.PlainText
          wrapMode: Text.Wrap
          color: Commons.Color.notifications.text
          font.pixelSize: 11
        }
        Text {
          text: "Speaker / headphones"
          font.pixelSize: 14
          color: Commons.Color.notifications.text
        }
        DeviceChoice {
          id: outputChoice
          kind: "output"
          available: root.audio.outputAvailable === true
        }
        Text {
          width: parent.width
          text: outputChoice.currentIndex >= 0 ? outputChoice.model[outputChoice.currentIndex].detail : ""
          textFormat: Text.PlainText
          wrapMode: Text.Wrap
          color: Commons.Color.notifications.text
          font.pixelSize: 11
        }
        ActionButton {
          id: playButton
          text: "Play test sound"
          enabled: root.audio.canSelect === true && root.audio.outputAvailable === true && !root.busy
          onClicked: root.invoke("audio-speaker-check")
        }
        Text {
          width: parent.width
          text: root.checking ? "Local test tone · " + Math.ceil((root.check.remainingMs || 0) / 1000) + " seconds remaining" : "The test tone stops after 2 seconds. Stop check and Close also stop it. No microphone check is included."
          textFormat: Text.PlainText
          wrapMode: Text.Wrap
          color: Commons.Color.notifications.text
          font.pixelSize: 12
        }
      }
    }
    Row {
      id: footer
      anchors {
        left: parent.left
        bottom: parent.bottom
        margins: 14
      }
      spacing: 10
      ActionButton {
        id: stopButton
        text: "Stop check"
        enabled: root.configured
        onClicked: root.invoke("audio-stop-check")
      }
      ActionButton {
        id: closeButton
        text: "Close"
        onClicked: root.visible = false
      }
    }
  }
}
