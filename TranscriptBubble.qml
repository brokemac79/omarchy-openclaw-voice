// Copyright (c) 2026 brokemac79
// SPDX-License-Identifier: MIT
import QtQuick
import qs.Commons

Rectangle {
  id: bubble
  required property string speaker
  required property string words
  property bool replying: false
  visible: words.length > 0
  implicitHeight: content.implicitHeight + 28
  radius: 14
  color: Color.notifications.background
  border.color: replying ? Color.accent : Color.notifications.border
  border.width: 1

  Column {
    id: content
    anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
    spacing: 7
    Text {
      text: bubble.speaker
      textFormat: Text.PlainText
      font.pixelSize: 11
      font.bold: true
      color: Color.accent
    }
    Item {
      width: parent.width
      height: Math.min(wordsText.implicitHeight, (bubble.speaker === "You" ? 4 : 10) * 19)
      clip: true
      Text {
        id: wordsText
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
        // Bottom alignment follows the actual rendered tail, including newlines.
        // Character limits alone cannot guarantee the newest words are visible.
        text: bubble.words
        textFormat: Text.PlainText
        wrapMode: Text.Wrap
        font.pixelSize: 14
        lineHeightMode: Text.FixedHeight
        lineHeight: 19
        color: Color.notifications.text
      }
    }
  }
}
