// Copyright (c) 2026 brokemac79
// SPDX-License-Identifier: MIT
import QtQuick
import qs.Commons

Column {
  id: root
  property var destination: ({})
  property var choices: []
  property bool reviewRequired: false
  signal selected(string id)
  signal refresh()
  spacing: 8
  Text {
    width: parent.width
    text: "Voice destination · " + (root.destination.state || "stale") + "\n"
      + (root.destination.agent ? root.destination.agent + " · " : "")
      + (root.destination.label || "Destination unknown")
      + (root.destination.target ? "\n" + root.destination.target : "")
    textFormat: Text.PlainText; wrapMode: Text.WordWrap
    color: Color.notifications.text; font.pixelSize: 13; font.bold: true
  }
  Text {
    width: parent.width
    text: root.destination.message || ""
    visible: text.length > 0
    textFormat: Text.PlainText; wrapMode: Text.WordWrap
    color: Color.notifications.text; font.pixelSize: 12
  }
  Text {
    width: parent.width
    text: root.reviewRequired ? "End voice, review unknown outcomes, then Dismiss results before switching. Submitted work may still continue on the previous destination."
      : "Choose an existing conversation. Its Gateway routing and ordinary approvals still apply; clarify ambiguous actions normally."
    textFormat: Text.PlainText; wrapMode: Text.WordWrap
    color: Color.notifications.text; font.pixelSize: 12
  }
  Repeater {
    model: root.choices
    delegate: Rectangle {
      required property var modelData
      width: root.width
      implicitHeight: choiceText.implicitHeight + 16
      radius: 7
      enabled: root.enabled && root.destination.canSwitch === true && root.destination.switching !== true && modelData.state === "ready"
      opacity: enabled ? 1 : 0.5
      color: Color.notifications.background
      border.color: modelData.id === root.destination.id ? Color.accent : Color.notifications.border
      Text {
        id: choiceText
        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 8 }
        text: parent.modelData.label + " · " + parent.modelData.agent + "\n" + parent.modelData.target + " · " + parent.modelData.state
        textFormat: Text.PlainText; wrapMode: Text.WordWrap
        color: Color.notifications.text; font.pixelSize: 12
      }
      Accessible.role: Accessible.Button
      Accessible.name: modelData.label
      Accessible.onPressAction: root.selected(modelData.id)
      MouseArea { anchors.fill: parent; onClicked: root.selected(parent.modelData.id) }
    }
  }
  Text {
    text: "Refresh destinations"
    color: Color.notifications.text; font.pixelSize: 12
    Accessible.role: Accessible.Button; Accessible.name: text
    Accessible.onPressAction: root.refresh()
    MouseArea { anchors.fill: parent; onClicked: root.refresh() }
  }
}
