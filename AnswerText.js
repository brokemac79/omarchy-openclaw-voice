// Copyright (c) 2026 brokemac79
// SPDX-License-Identifier: MIT
.pragma library

var answerLimit = 65536;
var linkLimit = 12;

function safeLink(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\s\u0000-\u001f\u007f\\<>"'`]/.test(value)) return false;
  // Only ordinary web URLs, without userinfo, escaped hosts or shell handling.
  return /^https?:\/\/(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::[0-9]{1,5})?(?:[/?#][^\s]*)?$/i.test(value);
}

function links(text) {
  var found = [], match;
  var pattern = /https?:\/\/[^\s<>"'`]+/gi;
  var source = String(text || "").slice(0, answerLimit);
  while ((match = pattern.exec(source)) !== null && found.length < linkLimit) {
    var url = match[0].replace(/[.,;:!?]+$/, "");
    // Remove Markdown delimiters and prose punctuation, preserving balanced
    // parentheses that are actually part of the URL.
    while (/[)\]}]$/.test(url)) {
      var close = url.slice(-1), open = close === ")" ? "(" : close === "]" ? "[" : "{";
      if (url.split(close).length <= url.split(open).length) break;
      url = url.slice(0, -1);
    }
    if (safeLink(url) && found.indexOf(url) === -1) found.push(url);
  }
  return found;
}
