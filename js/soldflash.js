/* ============================================================
   SOLD / UNSOLD FLASH — trigger

   Watches the board's event feed and drops a gavel across the On The
   Block card the moment a player is settled. Shared by the organiser
   console, the captain console and the public board so the hammer falls
   in the same instant everywhere.

   It plays on the CARD, not the inner container, so it still covers the
   whole thing in the organiser's full screen view — and it is appended
   after the render, so a card that has just gone back to "nobody is on
   the block" does not wipe it.
   ============================================================ */

(function (global) {
  "use strict";

  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var LIFETIME = 2900;   /* must outlast the CSS, which ends at 2.8s */

  /* hostId is the element the view draws the player into; the flash mounts
     on its enclosing .auc-card so it covers the whole box. */
  function Flash(hostId) {
    this.hostId = hostId;
    this.seen = null;
    this.primed = false;
    this.el = null;
  }

  /* The newest settled event, if any. board.events arrives newest first. */
  function latestResult(board) {
    var evs = (board && board.events) || [];
    for (var i = 0; i < evs.length; i++) {
      if (evs[i].kind === "sold" || evs[i].kind === "unsold") return evs[i];
    }
    return null;
  }

  Flash.prototype.check = function (board) {
    var ev = latestResult(board);
    if (!ev) return;

    /* id is a bigserial and strictly monotonic; created_at is only the
       transaction time, so several events can share one. Prefer the id. */
    var key = ev.kind + "|" + (ev.id !== undefined && ev.id !== null ? ev.id : ev.created_at);

    /* First board of the session just establishes where we came in. Without
       this, opening the page would replay whatever happened last. */
    if (!this.primed) {
      this.primed = true;
      this.seen = key;
      return;
    }
    if (key === this.seen) return;

    this.seen = key;
    this.play(ev.kind, ev.message);
  };

  Flash.prototype.play = function (kind, message) {
    var host = document.getElementById(this.hostId);
    if (!host) return;

    var mount = host.closest ? host.closest(".auc-card") : null;
    if (!mount) mount = host;

    /* a second sale before the first finished should replace, not stack */
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);

    var el = document.createElement("div");
    el.className = "otb-flash " + (kind === "sold" ? "sold" : "unsold");
    el.setAttribute("aria-live", "polite");
    el.innerHTML =
      '<div class="otb-flash-gavel"><i class="fa-solid fa-gavel"></i></div>' +
      '<div class="otb-flash-word">' + (kind === "sold" ? "SOLD" : "UNSOLD") + "</div>" +
      '<div class="otb-flash-msg">' + esc(message || "") + "</div>";

    mount.appendChild(el);
    this.el = el;

    var self = this;
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (self.el === el) self.el = null;
    }, LIFETIME);
  };

  global.SoldFlash = function (hostId) { return new Flash(hostId); };
})(window);
