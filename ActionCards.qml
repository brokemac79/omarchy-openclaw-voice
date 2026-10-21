// Copyright (c) 2026 brokemac79
// SPDX-License-Identifier: MIT
import QtQuick
import qs.Commons
import qs.Commons as Commons

Rectangle {
  id: root
  property var cards: []
  property int earlierUnknown: 0
  property bool additionalUnknown: false
  visible: cards.length > 0 || earlierUnknown > 0 || additionalUnknown
  implicitHeight: content.implicitHeight + 24
  radius: 14
  color: Commons.Color.notifications.background
  border.color: Commons.Color.notifications.border
  border.width: 1
  readonly property string summary: {
    const lines = cards.slice(-4).map(card => "Voice turn " + card.number + " · "
      + (card.status === "heard" ? "Heard" : "Outcome unknown"))
    if (earlierUnknown > 0) lines.unshift(earlierUnknown + " earlier voice turn(s) · Outcome unknown")
    if (additionalUnknown) lines.push("Additional voice turns · Outcome unknown")
    return lines.join("\n")
  }
  Column {
    id: content
    anchors { left: parent.left; right: parent.right; top: parent.top; margins: 12 }
    spacing: 7
    Text {
      text: "Action status"
      textFormat: Text.PlainText; font.pixelSize: 11; font.bold: true
      color: Commons.Color.accent
    }
    Text {
      width: parent.width; text: root.summary
      textFormat: Text.PlainText; wrapMode: Text.WordWrap; font.pixelSize: 13
      color: Commons.Color.notifications.text
    }
    Text {
      width: parent.width
      text: "Heard confirms transcription only. Action start and completion cannot be verified on this connection."
      textFormat: Text.PlainText; wrapMode: Text.WordWrap; font.pixelSize: 12
      color: Commons.Color.notifications.text
    }
  }
}
