// Copyright (c) 2026 omarchy-voice contributors
// Modifications Copyright (c) 2026 brokemac79
// SPDX-License-Identifier: MIT
// Adapted from wombatoperator/omarchy-voice; see CREDITS.md and LICENSE-OMA.

pragma ComponentBehavior: Bound

import QtQuick
import Quickshell.Hyprland
import QtQuick.Window
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "Instance.js" as Instance

// Reads the state file the daemon writes on every transition, so the bar
// reflects what the assistant is doing without polling a process.
BarWidget {
  id: root
  moduleName: "community.openclaw-voice"
  property string voiceInstance: setting("voiceInstance", "default")
  property string voiceControl: setting("voiceControl", "")
  property bool holdShortcutEnabled: setting("holdShortcutEnabled", false)
  property bool showDestinationLabel: setting("showDestinationLabel", false)
  readonly property string voiceBasename: Instance.basename(voiceInstance)
  readonly property string voiceRuntime: voiceBasename ? Quickshell.env("XDG_RUNTIME_DIR") + "/" + voiceBasename : ""
  readonly property string controlPath: Instance.controlPath(voiceInstance, voiceControl, Quickshell.env("HOME"))
  readonly property bool configured: voiceBasename !== "" && controlPath !== ""
  function toggleVoice() {
    runControl("toggle")
  }
  function runControl(command) {
    if (!configured || control.running || !["toggle", "mute", "quiet", "resume-speech", "stop", "dismiss-result", "destinations", "audio-devices", "audio-speaker-check"].includes(command)) return
    control.operation = command
    control.destinationId = ""
    control.running = true
  }
  function selectDestination(id) {
    if (!configured || control.running || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(id)) return
    control.operation = "select-destination"; control.destinationId = id; control.running = true
  }
  function selectAudioDevice(kind, id) {
    if (!configured || control.running || !["input", "output"].includes(kind) || !/^(default|[a-f0-9]{16})$/.test(id)) return;
    control.operation = "select-audio-device"; control.deviceKind = kind; control.deviceId = id; control.running = true;
  }

  // Owned by this bar entry: disabling it also removes its visual surfaces.
  property alias conversation: conversationView
  VoiceOrb {
    id: conversationView
    voiceInstance: root.voiceInstance
    showOrb: root.setting("showOrb", false)
    screen: root.QsWindow.window ? root.QsWindow.window.screen : null
  }

  Process {
    id: control
    property string operation: "toggle"
    property string destinationId: ""
    property string deviceKind: ""
    property string deviceId: ""
    command: operation === "select-destination" ? [root.controlPath, operation, destinationId]
      : operation === "select-audio-device" ? [root.controlPath, operation, deviceKind, deviceId] : [root.controlPath, operation]
  }
  // A stop must still reach the daemon while a slow start owns `control`.
  Process { id: audioStop; command: [root.controlPath, "audio-stop-check"] }
  property var controlsState: ({})
  property alias voiceControls: controlsView
  property alias answerPanel: answerView
  property alias audioPanel: audioView
  property alias holdPanel: holdView
  property alias holdShortcut: holdShortcutLoader
  Process {
    id: holdPulse
    property string operation: "hold-start"
    property string token: ""
    command: [root.controlPath, operation, token]
    onExited: (exitCode, exitStatus) => { if (exitCode !== 0) holdView.release() }
  }
  Process {
    id: holdRelease
    property string token: ""
    command: [root.controlPath, "hold-release", token]
  }
  HoldPanel {
    id: holdView
    screen: root.QsWindow.window ? root.QsWindow.window.screen : null
    voiceState: root.controlsState
    configured: root.configured
    current: root.updatedAt > 0 && Date.now() / 1000 - root.updatedAt < 20 && root.status !== "stopped"
    busy: control.running || holdPulse.running || holdRelease.running
    onCommand: (operation, token) => {
      if (!root.configured) return;
      if (operation === "hold-release") {
        if (!holdRelease.running) { holdRelease.token = token; holdRelease.running = true }
      } else if (!holdPulse.running && ["hold-start", "hold-renew"].includes(operation)) {
        holdPulse.operation = operation; holdPulse.token = token; holdPulse.running = true;
      }
    }
    onEndVoice: root.runControl("stop")
    WlrLayershell.namespace: root.voiceBasename + "-hold"
  }
  Loader {
    id: holdShortcutLoader
    active: root.configured && root.holdShortcutEnabled
    onActiveChanged: if (!active) holdView.release("shortcut")
    sourceComponent: GlobalShortcut {
      appid: root.voiceBasename
      name: "hold-to-talk"
      description: "Hold to talk to OpenClaw"
      onPressed: holdView.begin("shortcut")
      onReleased: holdView.release("shortcut")
      Component.onDestruction: holdView.release("shortcut")
    }
  }
  AudioPanel {
    id: audioView
    screen: root.QsWindow.window ? root.QsWindow.window.screen : null
    voiceState: root.controlsState
    configured: root.configured
    current: root.updatedAt > 0 && Date.now() / 1000 - root.updatedAt < 20 && root.status !== "stopped"
    busy: control.running
    onExecute: command => root.runControl(command)
    onSelectDevice: (kind, id) => root.selectAudioDevice(kind, id)
    onStopCheck: if (root.configured && !audioStop.running) audioStop.running = true
    WlrLayershell.namespace: root.voiceBasename + "-audio"
  }
  AnswerPanel {
    id: answerView
    screen: root.QsWindow.window ? root.QsWindow.window.screen : null
    voiceState: root.controlsState
    current: root.updatedAt > 0 && Date.now() / 1000 - root.updatedAt < 20 && root.status !== "stopped"
    onLinkRequested: url => Qt.openUrlExternally(url)
    WlrLayershell.namespace: root.voiceBasename + "-answer"
  }
  VoiceControls {
    id: controlsView
    screen: root.QsWindow.window ? root.QsWindow.window.screen : null
    voiceState: root.controlsState
    configured: root.configured
    current: root.updatedAt > 0 && Date.now() / 1000 - root.updatedAt < 20 && root.status !== "stopped"
    busy: control.running
    onExecute: command => root.runControl(command)
    onSelectDestination: id => root.selectDestination(id)
    onShowAnswer: { controlsView.visible = false; audioView.visible = false; holdView.visible = false; answerView.visible = true }
    onShowAudio: { controlsView.visible = false; answerView.visible = false; holdView.visible = false; audioView.visible = true }
    onShowHold: { controlsView.visible = false; answerView.visible = false; audioView.visible = false; holdView.visible = true }
    WlrLayershell.namespace: root.voiceBasename + "-controls"
  }

  property string status: "stopped"
  property string label: ""
  property real updatedAt: 0
  readonly property string activationState: updatedAt === 0 || status === "stopped" ? "Unknown"
    : status === "checking" ? "Local audio check" : status === "input-muted" ? "Input muted"
    : status === "standby" ? "Standby" : status === "preparing" ? "Preparing voice" : status === "connecting" ? "Connecting" : status === "stopping" ? "Stopping"
    : ["listening", "thinking", "acting", "confirm"].includes(status) ? "Talk"
    : status === "idle" ? "Off" : "Unavailable"
  Timer {
    interval: 5000; running: true; repeat: true
    onTriggered: {
      if (root.updatedAt > 0 && Date.now() / 1000 - root.updatedAt > 20) {
        root.status = "stopped"; root.label = "Audio state unknown — use Stop"
      }
    }
  }

  FileView {
    id: state
    path: root.voiceRuntime ? root.voiceRuntime + "/state.json" : ""
    printErrors: root.updatedAt > 0
    watchChanges: true
    onFileChanged: reload()
    onLoaded: {
      try {
        const parsed = JSON.parse(state.text())
        root.status = parsed.status || "idle"
        root.label = parsed.text || ""
        root.updatedAt = parsed.updated || 0
        root.controlsState = parsed
      } catch (e) {
        root.status = "error"
        root.label = ""
        root.updatedAt = 0
        root.controlsState = ({})
      }
    }
    onLoadFailed: {
      root.status = "stopped"
      root.label = ""
      root.updatedAt = 0
      root.controlsState = ({})
    }
  }

  // A reboot removes the runtime directory. A watch cannot attach until it exists.
  Timer {
    interval: 1000; repeat: true
    running: root.voiceRuntime !== "" && root.updatedAt === 0
    onTriggered: state.reload()
  }

  readonly property var destination: controlsState.destination || ({state:"stale", label:"Destination unknown"})
  readonly property string destinationText: (destination.state === "ready" ? "" : destination.state === "unavailable" ? "Unavailable · " : "Stale · ")
    + (destination.agent ? destination.agent + " · " : "")
    + (destination.target && destination.target !== "Gateway-selected execution" && destination.target !== "Unverified execution context"
       ? destination.target : destination.label || "Destination unknown")
  // Bar sections do not reserve space around the centre widgets. Keep the
  // default to one icon slot; optional agent text must stay within our allocation.
  readonly property bool destinationLabelVisible: showDestinationLabel && !vertical
  implicitWidth: vertical ? barSize : button.implicitWidth
    + (destinationLabelVisible ? 6 + Math.min(64, destinationTextView.implicitWidth) : 0)
  implicitHeight: button.implicitHeight
  clip: true

  function tooltipLine(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 512)
  }
  TextMetrics {
    id: destinationMetric
    font.family: button.fontFamily
    font.pixelSize: Style.font.body
    text: root.tooltipLine(root.destinationText)
    elide: Qt.ElideRight
    elideWidth: 280
  }
  TextMetrics {
    id: statusMetric
    font: destinationMetric.font
    text: root.tooltipLine(!root.configured ? "Instance control is not configured"
      : root.label || "Audio state unknown — use Stop")
    elide: Qt.ElideRight
    elideWidth: 280
  }

  Text {
    id: destinationTextView
    anchors.left: button.right
    anchors.leftMargin: 6
    anchors.verticalCenter: parent.verticalCenter
    visible: root.destinationLabelVisible
    width: Math.max(0, Math.min(64, implicitWidth, root.width - button.width - 6))
    text: root.tooltipLine(root.destination.agent || (root.destination.state === "ready" ? "Voice"
      : root.destination.state === "unavailable" ? "Unavailable" : "Stale"))
    textFormat: Text.PlainText
    elide: Text.ElideRight
    color: button.foreground
    font.pixelSize: 12
    font.family: button.fontFamily
    MouseArea {
      anchors.fill: parent
      acceptedButtons: Qt.LeftButton | Qt.RightButton
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onEntered: if (root.bar) root.bar.showTooltip(button, button.tooltipText)
      onExited: if (root.bar) root.bar.hideTooltip(button)
      onClicked: mouse => button.triggerPress(mouse.button)
    }
  }

  BarIconButton {
    id: button
    anchors { left: parent.left; top: parent.top; bottom: parent.bottom }
    width: Math.min(implicitWidth, root.width)
    bar: root.bar
    active: root.status === "listening" || root.status === "thinking"
             || root.status === "acting" || root.status === "confirm"
             || root.status === "input-muted" || root.status === "checking" || root.status === "standby" || root.status === "preparing" || root.status === "connecting" || root.status === "stopping"
    // Omarchy sizes tooltips to unwrapped text. Bound each line using its font
    // metrics and include destination context once, rather than repeating it.
    tooltipText: "OpenClaw Voice · " + root.activationState + "\n"
      + destinationMetric.elidedText + "\n" + statusMetric.elidedText + "\nRight-click for controls"
    Accessible.role: Accessible.Button
    Accessible.name: "OpenClaw Voice"
    Accessible.description: "OpenClaw Voice — " + root.activationState + " — " + root.destinationText
      + " — " + statusMetric.text + ". Right-click for voice controls"
    Accessible.onPressAction: button.triggerPress(Qt.LeftButton)

    iconComponent: Item {
      Image {
        anchors.fill: parent
        source: Qt.resolvedUrl("openclaw-voice.svg")
        sourceSize.width: Math.ceil(width * Screen.devicePixelRatio)
        sourceSize.height: Math.ceil(height * Screen.devicePixelRatio)
        fillMode: Image.PreserveAspectFit
        smooth: true
        opacity: root.status === "stopped" || root.status === "unconfigured" ? 0.5 : 1
      }

      // Keep the assistant's identity visible; only the small status dot changes.
      Rectangle {
        visible: button.active || root.status === "error" || !root.configured || root.destination.state !== "ready"
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        width: Math.max(5, Math.round(parent.width * 0.28))
        height: width
        radius: width / 2
        color: root.status === "error" || root.status === "preparing" || root.status === "connecting" || root.status === "stopping" || !root.configured || root.destination.state !== "ready" ? "#ffb454"
             : root.status === "standby" ? "#82aaff" : "#5de4c7"
        border.width: 1
        border.color: button.foreground
      }
    }
    onPressed: function(b) {
      // Approval remains in OpenClaw; a click only starts or ends voice.
      if (b === Qt.RightButton) { answerView.visible = false; audioView.visible = false; holdView.visible = false; controlsView.visible = !controlsView.visible }
      else if (b === Qt.LeftButton) root.toggleVoice()
    }
  }
}
