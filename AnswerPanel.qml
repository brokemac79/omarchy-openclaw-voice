// Copyright (c) 2026 brokemac79
// SPDX-License-Identifier: MIT
import QtQuick
import QtQuick.Controls as Controls
import Quickshell
import Quickshell.Wayland
import qs.Commons
import "AnswerText.js" as AnswerText

// Deliberately opened, focusable reader. It has no audio/control operations.
PanelWindow {
  id: root
  property var voiceState: ({})
  property bool current: false
  property int textSize: 15
  property alias editor: replyText
  property alias viewport: viewport
  property alias actions: footer
  signal linkRequested(string url)
  readonly property var answer: current ? voiceState.answer || ({}) : ({})
  readonly property string answerText: String(answer.text || "").slice(0, AnswerText.answerLimit)
  readonly property var webLinks: AnswerText.links(answerText)
  readonly property var destination: voiceState.destination || ({})
  readonly property string destinationText: [destination.agent, destination.label, destination.target].filter(value => !!value).join(" · ")
  readonly property string answerStatus: !current ? "Answer unavailable: companion state is stale."
    : !answerText ? "No received answer."
    : answer.truncated ? "Truncated: reply exceeded the 65,536-unit text limit."
    : answer.complete ? "Received reply · action completion is unverified."
    : "Partial received reply · more text may not arrive."
  function copyAll() {
    if (!current || !answerText) return false;
    replyText.selectAll(); replyText.copy();
    return true;
  }
  function copySelection() {
    if (!current || !replyText.selectedText) return false;
    replyText.copy(); return true;
  }
  function openLink(url) {
    if (!current || !AnswerText.safeLink(url) || webLinks.indexOf(url) === -1) return false;
    linkRequested(url); return true;
  }
  function resizeText(delta) { textSize = Math.max(12, Math.min(24, textSize + delta)); }
  component ActionButton: Controls.Button {
    padding: 10
    implicitHeight: Math.max(40, contentItem.implicitHeight + 16)
    font.pixelSize: 13
    opacity: enabled ? 1 : 0.45
    background: Rectangle {
      radius: 7
      color: parent.down ? Color.accent : Color.notifications.background
      border.color: parent.activeFocus || parent.hovered ? Color.accent : Color.notifications.border
    }
    contentItem: Text {
      text: parent.text; textFormat: Text.PlainText
      font: parent.font; color: Color.notifications.text
      horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter
    }
  }
  visible: false
  anchors { top: true; right: true }
  margins { top: 52; right: 18 }
  implicitWidth: Math.min(700, screen ? screen.width - 36 : 700)
  implicitHeight: Math.min(640, screen ? screen.height - 90 : 640)
  color: "transparent"
  exclusionMode: ExclusionMode.Ignore
  WlrLayershell.layer: WlrLayer.Overlay
  WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
  WlrLayershell.namespace: "openclaw-voice-answer"
  onVisibleChanged: if (visible) Qt.callLater(() => replyText.forceActiveFocus())
  onAnswerTextChanged: if (replyText.selectionStart === replyText.selectionEnd) viewport.contentY = 0
  Shortcut { sequence: "Escape"; enabled: root.visible; onActivated: root.visible = false }

  Rectangle {
    anchors.fill: parent
    radius: 14
    color: Color.notifications.background
    border.color: Color.notifications.border
    Column {
      id: header
      anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
      spacing: 7
      Text { text: "Received answer"; color: Color.notifications.text; font.pixelSize: 17; font.bold: true }
      Text {
        width: parent.width; text: root.destinationText || "Destination context unavailable"
        textFormat: Text.PlainText; wrapMode: Text.Wrap; maximumLineCount: 2; elide: Text.ElideRight
        color: Color.notifications.text; font.pixelSize: 12
      }
      Text {
        width: parent.width; text: root.answerStatus; wrapMode: Text.Wrap; textFormat: Text.PlainText
        color: Color.notifications.text; font.pixelSize: 12
      }
    }
    Flickable {
      id: viewport
      anchors { left: parent.left; right: parent.right; top: header.bottom; bottom: footer.top; margins: 14 }
      clip: true; contentWidth: width; contentHeight: body.implicitHeight
      boundsBehavior: Flickable.StopAtBounds
      Controls.ScrollBar.vertical: Controls.ScrollBar { policy: Controls.ScrollBar.AsNeeded }
      Column {
        id: body
        width: viewport.width - 14
        spacing: 14
        TextEdit {
          id: replyText
          width: parent.width
          height: Math.max(30, contentHeight)
          text: root.answerText
          textFormat: TextEdit.PlainText
          wrapMode: TextEdit.Wrap
          readOnly: true; selectByMouse: true; persistentSelection: true
          activeFocusOnTab: true
          color: Color.notifications.text
          selectionColor: Color.accent
          selectedTextColor: Color.notifications.background
          font.pixelSize: root.textSize; font.family: "monospace"
          Accessible.name: "Received answer text"
          Keys.onEscapePressed: root.visible = false
        }
        Column {
          id: linksView
          width: parent.width; spacing: 6
          visible: root.webLinks.length > 0
          Text { text: "Web links · open explicitly"; color: Color.notifications.text; font.pixelSize: 13 }
          Repeater {
            model: root.webLinks
            delegate: ActionButton {
              required property string modelData
              width: linksView.width
              text: modelData
              Accessible.name: "Open web link " + modelData
              contentItem: Text { text: parent.text; textFormat: Text.PlainText; wrapMode: Text.Wrap; color: Color.notifications.text; font.pixelSize: 13 }
              onClicked: root.openLink(modelData)
            }
          }
        }
      }
    }
    Flow {
      id: footer
      anchors { left: parent.left; right: parent.right; bottom: parent.bottom; margins: 14 }
      spacing: 6
      ActionButton { text: "Copy all"; enabled: root.current && !!root.answerText; onClicked: root.copyAll() }
      ActionButton { text: "Copy selection"; enabled: root.current && !!replyText.selectedText; onClicked: root.copySelection() }
      ActionButton { text: "A−"; Accessible.name: "Smaller answer text"; enabled: root.textSize > 12; onClicked: root.resizeText(-1) }
      ActionButton { text: "A+"; Accessible.name: "Larger answer text"; enabled: root.textSize < 24; onClicked: root.resizeText(1) }
      ActionButton { text: "Close"; onClicked: root.visible = false }
    }
  }
}
