// Copyright (c) 2026 omarchy-voice contributors
// Modifications Copyright (c) 2026 brokemac79
// SPDX-License-Identifier: MIT
// Adapted from wombatoperator/omarchy-voice; see CREDITS.md and LICENSE-OMA.

import QtQuick
import Quickshell
import Quickshell.Io
import qs.Ui

// Reads the state file the daemon writes on every transition, so the bar
// reflects what the assistant is doing without polling a process.
BarWidget {
  id: root
  moduleName: "ant.indicator"

  property string status: "stopped"
  property string label: ""
  property real updatedAt: 0
  Timer {
    interval: 5000; running: true; repeat: true
    onTriggered: {
      if (root.updatedAt > 0 && Date.now() / 1000 - root.updatedAt > 20) {
        root.status = "stopped"; root.label = "Microphone off"
      }
    }
  }

  readonly property var icons: ({
    "stopped":   "󰍭",
    "idle":      "󰍬",
    "listening": "󰍬",
    "thinking":  "󱚟",
    "acting":    "󱐋",
    "confirm":   "󰀦",
    "error":     "󰍭",
    // Gateway OAuth has not been configured yet.
    "unconfigured": "󰍭"
  })

  FileView {
    id: state
    path: Quickshell.env("XDG_RUNTIME_DIR") + "/ant-voice/state.json"
    watchChanges: true
    onFileChanged: reload()
    onLoaded: {
      try {
        const parsed = JSON.parse(state.text())
        root.status = parsed.status || "idle"
        root.label = parsed.text || ""
        root.updatedAt = parsed.updated || 0
      } catch (e) {
        root.status = "error"
        root.label = ""
      }
    }
    onLoadFailed: {
      root.status = "stopped"
      root.label = ""
    }
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.icons[root.status] || root.icons["idle"]
    active: root.status === "listening" || root.status === "thinking"
             || root.status === "acting" || root.status === "confirm"
    tooltipText: root.label !== ""
                 ? root.status + " — " + root.label
                 : "Ant Voice: " + root.status
    onPressed: function(b) {
      // Approval remains in OpenClaw; a click only starts or ends voice.
      root.bar.run(Quickshell.env("HOME") + "/.local/bin/ant-voice toggle")
    }
  }
}
