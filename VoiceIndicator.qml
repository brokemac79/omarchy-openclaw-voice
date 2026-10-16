// Copyright (c) 2026 omarchy-voice contributors
// Modifications Copyright (c) 2026 brokemac79
// SPDX-License-Identifier: MIT
// Adapted from wombatoperator/omarchy-voice; see CREDITS.md and LICENSE-OMA.

pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Window
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Ui
import "Instance.js" as Instance

// Reads the state file the daemon writes on every transition, so the bar
// reflects what the assistant is doing without polling a process.
BarWidget {
  id: root
  moduleName: "community.openclaw-voice"
  property string voiceInstance: setting("voiceInstance", "default")
  property string voiceControl: setting("voiceControl", "")
  readonly property string voiceBasename: Instance.basename(voiceInstance)
  readonly property string voiceRuntime: voiceBasename ? Quickshell.env("XDG_RUNTIME_DIR") + "/" + voiceBasename : ""
  readonly property string controlPath: Instance.controlPath(voiceInstance, voiceControl, Quickshell.env("HOME"))
  readonly property bool configured: voiceBasename !== "" && controlPath !== ""
  function toggleVoice() {
    runControl("toggle")
  }
  function runControl(command) {
    if (!configured || control.running || !["toggle", "mute", "quiet", "resume-speech", "stop", "dismiss-result"].includes(command)) return
    control.operation = command
    control.running = true
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
    command: [root.controlPath, operation]
  }
  property var controlsState: ({})
  property alias voiceControls: controlsView
  VoiceControls {
    id: controlsView
    screen: root.QsWindow.window ? root.QsWindow.window.screen : null
    voiceState: root.controlsState
    configured: root.configured
    current: root.updatedAt > 0 && Date.now() / 1000 - root.updatedAt < 20 && root.status !== "stopped"
    busy: control.running
    onExecute: command => root.runControl(command)
    WlrLayershell.namespace: root.voiceBasename + "-controls"
  }

  property string status: "stopped"
  property string label: ""
  property real updatedAt: 0
  readonly property string activationState: updatedAt === 0 || status === "stopped" ? "Unknown"
    : status === "standby" ? "Standby" : status === "connecting" ? "Connecting" : status === "stopping" ? "Stopping"
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

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    active: root.status === "listening" || root.status === "thinking"
             || root.status === "acting" || root.status === "confirm"
             || root.status === "standby" || root.status === "connecting" || root.status === "stopping"
    tooltipText: "OpenClaw Voice — " + root.activationState + " — " + (!root.configured ? "Instance control is not configured" : (root.label !== "" ? root.label : "Audio state unknown — use Stop")) + " · Right-click for voice controls"
    Accessible.role: Accessible.Button
    Accessible.name: "OpenClaw Voice"
    Accessible.description: button.tooltipText
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
        visible: button.active || root.status === "error" || !root.configured
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        width: Math.max(5, Math.round(parent.width * 0.28))
        height: width
        radius: width / 2
        color: root.status === "error" || root.status === "connecting" || root.status === "stopping" || !root.configured ? "#ffb454"
             : root.status === "standby" ? "#82aaff" : "#5de4c7"
        border.width: 1
        border.color: button.foreground
      }
    }
    onPressed: function(b) {
      // Approval remains in OpenClaw; a click only starts or ends voice.
      if (b === Qt.RightButton) controlsView.visible = !controlsView.visible
      else if (b === Qt.LeftButton) root.toggleVoice()
    }
  }
}
