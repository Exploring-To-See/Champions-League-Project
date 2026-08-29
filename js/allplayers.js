/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — "ALL PLAYERS" TABLE

   The whole pool in one filterable table: every player, what they went
   for and which team took them. Shared by the public board and the
   captain console — it emits its own markup as well as its rows, so the
   two cannot drift into showing different things.

   Callers give it a prefix ("pub", "cap") so the two copies keep their
   own filter state on the same page-load lifecycle.
   ============================================================ */

(function (global) {
  "use strict";

  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Indian grouping, with the symbol — unlike the player card, this table
     has no rupee token beside the figure to carry it. */
  function money(n) {
    if (n === null || n === undefined) return "—";
    var s = String(Math.abs(Math.round(n))), out;
    if (s.length <= 3) out = s;
    else {
      var last3 = s.slice(-3), rest = s.slice(0, -3), parts = [];
      while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
      out = (rest ? rest + "," : "") + (parts.length ? parts.join(",") + "," : "") + last3;
    }
    return "₹" + out;
  }

  function id(prefix, part) { return prefix + "-players-" + part; }
  function $(x) { return document.getElementById(x); }

  /* Write the card once. Both views get identical markup this way. */
  function mount(hostId, prefix) {
    var host = $(hostId);
    if (!host || host.dataset.mounted === "1") return;
    host.dataset.mounted = "1";
    host.innerHTML =
      '<div class="auc-card">' +
        '<div class="auc-card-title">' +
          '<i class="fa-solid fa-users"></i> All Players' +
          '<span class="auc-pill available" id="' + id(prefix, "count") + '"></span>' +
        "</div>" +
        '<div class="auc-form-row">' +
          '<div class="auc-field"><label for="' + id(prefix, "search") + '">Search</label>' +
            '<input type="text" id="' + id(prefix, "search") +
            '" placeholder="Player name…" autocomplete="off"></div>' +
          '<div class="auc-field"><label for="' + id(prefix, "cat") + '">Category</label>' +
            '<select id="' + id(prefix, "cat") + '"><option value="ALL">All categories</option></select></div>' +
          '<div class="auc-field"><label for="' + id(prefix, "team") + '">Bought by</label>' +
            '<select id="' + id(prefix, "team") + '"><option value="ALL">All teams</option></select></div>' +
          '<div class="auc-field"><label for="' + id(prefix, "status") + '">Status</label>' +
            '<select id="' + id(prefix, "status") + '">' +
              '<option value="ALL">All</option>' +
              '<option value="sold">Sold</option>' +
              '<option value="available">Still in pool</option>' +
              '<option value="unsold">Unsold</option>' +
            "</select></div>" +
        "</div>" +
        '<div class="auc-table-box" style="max-height:560px; overflow-y:auto;">' +
          '<table class="auc-table"><thead><tr>' +
            "<th>#</th><th>Player</th><th>Category</th><th>Status</th><th>Bought By</th><th>Price</th>" +
          '</tr></thead><tbody id="' + id(prefix, "body") + '"></tbody></table>' +
        "</div>" +
      "</div>";
  }

  /* Rebuild a filter only when its underlying list actually changed, and put
     the viewer's choice back afterwards. Counting options instead would
     latch: an empty board still writes the fixed entries, so the count never
     falls back and teams added later would never appear. */
  function syncSelect(sel, signature, html) {
    if (!sel || sel.dataset.sig === signature) return;
    var prev = sel.value;
    sel.innerHTML = html;
    sel.dataset.sig = signature;
    var kept = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === prev) { kept = true; break; }
    }
    sel.value = kept ? prev : "ALL";
  }

  function render(prefix, board) {
    if (!board) return;
    var catSel = $(id(prefix, "cat"));
    var teamSel = $(id(prefix, "team"));
    var body = $(id(prefix, "body"));
    if (!body) return;

    var cats = board.categories || [];
    var teams = board.teams || [];

    syncSelect(catSel,
      cats.map(function (c) { return c.code + ":" + c.label; }).join("|"),
      '<option value="ALL">All categories</option>' +
        cats.map(function (c) {
          return '<option value="' + esc(c.code) + '">' + esc(c.label) + "</option>";
        }).join(""));

    syncSelect(teamSel,
      teams.map(function (t) { return t.id + ":" + t.name; }).join("|"),
      '<option value="ALL">All teams</option>' +
        teams.map(function (t) {
          return '<option value="' + esc(t.id) + '">' + esc(t.name) + "</option>";
        }).join("") + '<option value="NONE">Not bought yet</option>');

    function catOf(code) {
      for (var i = 0; i < cats.length; i++) if (cats[i].code === code) return cats[i];
      return null;
    }
    function teamOf(tid) {
      if (!tid) return null;
      for (var i = 0; i < teams.length; i++) if (teams[i].id === tid) return teams[i];
      return null;
    }

    var q = (($(id(prefix, "search")) || {}).value || "").toLowerCase().trim();
    var fcat = (catSel && catSel.value) || "ALL";
    var fteam = (teamSel && teamSel.value) || "ALL";
    var fstatus = (($(id(prefix, "status")) || {}).value) || "ALL";

    var rows = (board.players || []).slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    }).filter(function (p) {
      if (q && p.name.toLowerCase().indexOf(q) < 0) return false;
      if (fcat !== "ALL" && p.category !== fcat) return false;
      if (fteam === "NONE" && p.team_id) return false;
      if (fteam !== "ALL" && fteam !== "NONE" && p.team_id !== fteam) return false;
      /* Match the status exactly. "available" used to mean "not sold", which
         swept the unsold list in with the pool and left the Unsold option
         doing nothing at all. */
      if (fstatus !== "ALL" && p.status !== fstatus) return false;
      return true;
    });

    var placed = (board.players || []).filter(function (p) { return p.status === "sold"; }).length;
    var counter = $(id(prefix, "count"));
    if (counter) {
      counter.textContent = rows.length + " shown · " + placed + " of " +
        (board.players || []).length + " placed";
    }

    var html = rows.length ? rows.map(function (p) {
      var c = catOf(p.category);
      var t = teamOf(p.team_id);
      var statusLabel = p.status === "in_lot" ? "on the block" : p.status;
      return "<tr>" +
        '<td style="font-family:monospace; font-weight:800; color:var(--primary-cyan);">' +
          (p.is_retained ? "&mdash;" : p.sort_order) + "</td>" +
        "<td><b>" + esc(p.name) + "</b>" +
          (p.retained_role
            ? ' <span class="auc-squad-role">' + esc(p.retained_role.replace("_", " ")) + "</span>"
            : "") + "</td>" +
        '<td><span style="color:' + esc(c ? c.color : "#00e5ff") + '; font-weight:700;">' +
          esc(c ? c.label : p.category) + "</span></td>" +
        '<td><span class="auc-pill ' + esc(p.status) + '">' + esc(statusLabel) + "</span></td>" +
        "<td>" + (t
          ? '<span style="color:' + esc(t.color) + '; font-weight:700;">' + esc(t.name) + "</span>"
          : '<span class="auc-muted">—</span>') + "</td>" +
        '<td style="font-weight:800;">' +
          (p.status === "sold"
            ? (p.is_retained ? '<span class="auc-muted">retained</span>' : money(p.sold_price || 0))
            : '<span class="auc-muted">base ' + money(c ? c.base_price : 0) + "</span>") +
        "</td></tr>";
    }).join("")
      : '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">' +
        "No players match these filters.</td></tr>";

    /* setHTML skips the write when nothing changed, which keeps a reader's
       scroll position steady through the poll. */
    if (global.setHTML) global.setHTML(body, html);
    else if (body.innerHTML !== html) body.innerHTML = html;
  }

  /* Filters only redraw the table, so they stay responsive between polls. */
  function wire(prefix, onChange) {
    ["search", "cat", "team", "status"].forEach(function (part) {
      var el = $(id(prefix, part));
      if (!el) return;
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", onChange);
    });
  }

  global.AllPlayers = { mount: mount, render: render, wire: wire, money: money };
})(window);
