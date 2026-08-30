/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — PUBLIC LIVE AUCTION VIEW
   Read-only. Anyone can watch the auction unfold: the lot on the
   block, live bids, purses, squads and what is left in the pool.
   ============================================================ */

(function () {
  "use strict";

  var E = window.AuctionEngine;
  var money = E.formatINR;
  var shortMoney = E.formatShort;

  var api = null;
  var board = null;
  var flash = SoldFlash("pub-lot");

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function catOf(code) {
    if (!board) return null;
    for (var i = 0; i < board.categories.length; i++) {
      if (board.categories[i].code === code) return board.categories[i];
    }
    return null;
  }

  function teamOf(id) {
    if (!board || !id) return null;
    for (var i = 0; i < board.teams.length; i++) {
      if (board.teams[i].id === id) return board.teams[i];
    }
    return null;
  }

  function render(b) {
    board = b;
    if (!board) return;
    keepScroll(function () {
    section("status", renderStatus);
    section("lot", renderLot);
    section("teamboard", renderTeamBoard);
    section("teamtabs", renderTeamTabs);
    section("feed", renderFeed);
    section("allplayers", renderAllPlayers);
    section("pool", renderPool);
    });
    section("flash", function () { flash.check(board); });
  }

  function renderStatus() {
    var st = board.state.status;
    $("pub-status").className = "auc-status " + st;
    $("pub-status-text").textContent =
      st === "live" ? "LIVE NOW" :
      st === "paused" ? "PAUSED" :
      st === "completed" ? "AUCTION COMPLETE" : "NOT STARTED";
  }

  function renderLot() {
    var host = $("pub-lot");
    var lot = board.current_lot;
    var ctx = board.lot_context;

    /* When no lot is open, show the most recent sale as a SOLD stamp. */
    if (!lot || !ctx) {
      var recent = (board.events || []).filter(function (e) { return e.kind === "sold"; })[0];
      if (recent) {
        host.innerHTML =
          '<div style="text-align:center; padding:1.5rem 0;">' +
            '<div class="auc-sold-stamp">SOLD</div>' +
            '<div style="margin-top:1.1rem; font-size:1.05rem;">' + esc(recent.message) + "</div>" +
            '<div class="auc-muted" style="margin-top:0.5rem;">Waiting for the next draw…</div>' +
          "</div>";
      } else {
        setHTML(host, '<div class="auc-muted" style="text-align:center; padding:2rem 0;">' +
          '<i class="fa-solid fa-hourglass-half" style="font-size:2.4rem; opacity:0.35; display:block; margin-bottom:0.7rem;"></i>' +
          "The auction has not opened a lot yet.</div>");
      }
      return;
    }

    var player = null;
    for (var i = 0; i < board.players.length; i++) {
      if (board.players[i].id === lot.player_id) { player = board.players[i]; break; }
    }
    if (!player) { setHTML(host, ""); return; }

    var cat = catOf(player.category);

    var compulsory = ctx.compulsory_team_id
      ? '<div class="auc-alert forced" style="margin-top:1rem;">' +
        '<i class="fa-solid fa-gavel"></i><div>Compulsory fill — <b>' +
        esc(ctx.compulsory_team_name) + "</b> takes this player at base " +
        money(ctx.base) + ".</div></div>"
      : "";

    /* Identical card to the organiser console, from js/onblock.js. */
    setHTML(host, window.OnBlockCard.render(player, cat, ctx.base) + compulsory);
  }

  /* Captains, wallet and squad for all four teams in one grid, teams as
     columns. Three separate cards meant scrolling between facts that are
     only useful side by side — who has money left, who still needs what,
     and who they have already bought. */
  function renderTeamBoard() {
    var accounts = board.captains || [];
    var teams = board.teams || [];
    if (!teams.length) {
      $("pub-teamboard").innerHTML =
        '<tbody><tr><td class="auc-muted" style="padding:1.5rem;">' +
        "Teams have not been set up yet.</td></tr></tbody>";
      return;
    }

    /* captains come from a separate roster; index it by team */
    var acc = {};
    accounts.forEach(function (a) { acc[a.team_id] = a; });

    var lot = board.current_lot;

    function cells(render) {
      return teams.map(function (t) {
        return '<td style="vertical-align:top;">' + render(t, acc[t.id] || {}) + "</td>";
      }).join("");
    }

    var head = "<thead><tr><th></th>" + teams.map(function (t) {
      var leading = lot && lot.current_bidder_id === t.id;
      return '<th style="color:' + esc(t.color) + '; font-size:0.95rem;">' +
        esc(t.name) +
        (leading ? '<div style="color:var(--primary-gold); font-size:0.68rem;">&#9670; LEADING</div>' : "") +
        "</th>";
    }).join("") + "</tr></thead>";

    function label(txt) {
      return '<th scope="row" style="color:var(--text-muted); font-size:0.78rem; ' +
             'text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">' + txt + "</th>";
    }

    var rows = "";

    rows += "<tr>" + label("Captain") + cells(function (t, a) {
      return a.captain ? "<b>" + esc(a.captain) + "</b>"
                       : '<span class="auc-muted">not assigned</span>';
    }) + "</tr>";

    rows += "<tr>" + label("Vice Captain") + cells(function (t, a) {
      return a.vice_captain ? "<b>" + esc(a.vice_captain) + "</b>"
                            : '<span class="auc-muted">not assigned</span>';
    }) + "</tr>";

    rows += "<tr>" + label("Wallet left") + cells(function (t) {
      var pct = t.purse_total ? (t.purse_left / t.purse_total) * 100 : 0;
      return '<b style="color:var(--primary-gold); font-size:1.05rem;">' + money(t.purse_left) + "</b>" +
             '<div class="auc-progress" style="margin:0.4rem 0 0;"><div style="width:' +
             pct.toFixed(1) + '%"></div></div>';
    }) + "</tr>";

    rows += "<tr>" + label("Spent") + cells(function (t) {
      return money(t.purse_spent) +
        '<div class="auc-muted" style="font-size:0.72rem;">of ' + money(t.purse_total) + "</div>";
    }) + "</tr>";

    rows += "<tr>" + label("Squad size") + cells(function (t) {
      return "<b>" + t.squad_size + "</b>" +
        (t.total_unmet
          ? ' <span style="color:var(--primary-red); font-size:0.75rem;">(' +
            t.total_unmet + " short)</span>"
          : ' <span style="color:#22c55e; font-size:0.75rem;">complete</span>');
    }) + "</tr>";

    rows += "<tr>" + label("Requirements") + cells(function (t) {
      return '<div class="auc-chips">' + board.categories.map(function (c) {
        var own = (t.owned && t.owned[c.code]) || 0;
        var un = (t.unmet && t.unmet[c.code]) || 0;
        return '<span class="auc-chip ' + (un > 0 ? "short" : "met") + '">' +
          esc(c.short_code) + " " + own + "/" + c.min_per_team + "</span>";
      }).join("") + "</div>";
    }) + "</tr>";

    rows += "<tr>" + label("Squad") + cells(function (t) {
      var squad = board.players.filter(function (p) {
        return p.team_id === t.id && p.status === "sold";
      }).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

      if (!squad.length) return '<span class="auc-muted">No players yet</span>';

      return '<ul class="auc-squad-list" style="margin:0;">' + squad.map(function (p) {
        var c = catOf(p.category);
        return "<li><span>" +
          (p.is_retained ? "" : '<span style="font-family:monospace; color:var(--primary-cyan);">#' +
                                p.sort_order + "</span> ") +
          esc(p.name) +
          (p.retained_role
            ? ' <span class="auc-squad-role">' + esc(p.retained_role.replace("_", " ")) + "</span>"
            : "") +
          '<br><span class="auc-muted" style="font-size:0.72rem;">' +
            esc(c ? c.short_code : p.category) + "</span></span>" +
          "<span style='font-weight:800;'>" +
            (p.is_retained ? '<span class="auc-muted">retained</span>' : money(p.sold_price || 0)) +
          "</span></li>";
      }).join("") + "</ul>";
    }) + "</tr>";

    rows += "<tr>" + label("Sign-in") + cells(function (t, a) {
      return a.has_password
        ? '<span class="auc-pill sold">ACTIVE</span>'
        : '<span class="auc-pill in_lot">AWAITING PASSWORD</span>';
    }) + "</tr>";

    setHTML($("pub-teamboard"), head + "<tbody>" + rows + "</tbody>");
  }

  /* ---------- mobile team tabs ------------------------------
     The four-column table has to be swiped sideways on a phone, and its
     sticky label column slides over the values while you do it. On mobile
     the same facts are shown one team at a time instead, as plain rows.
     Which tab is open survives the five-second refresh. */
  var activeTeamTab = 0;

  function renderTeamTabs() {
    var teams = board.teams || [];
    var bar = $("pub-teamtabs");
    var panel = $("pub-teampanel");
    if (!bar || !panel) return;

    if (!teams.length) {
      setHTML(bar, "");
      setHTML(panel, '<div class="auc-muted">Teams have not been set up yet.</div>');
      return;
    }
    if (activeTeamTab >= teams.length) activeTeamTab = 0;

    var acc = {};
    (board.captains || []).forEach(function (a) { acc[a.team_id] = a; });

    setHTML(bar, teams.map(function (t, i) {
      return '<button class="auc-teamtab' + (i === activeTeamTab ? " active" : "") +
        '" style="--team-color:' + esc(t.color) + '" data-i="' + i + '">' +
        esc(t.short_name || t.name) + "</button>";
    }).join(""));

    bar.querySelectorAll(".auc-teamtab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activeTeamTab = parseInt(btn.dataset.i, 10) || 0;
        section("teamtabs", renderTeamTabs);
      });
    });

    var t = teams[activeTeamTab];
    var a = acc[t.id] || {};
    var lot = board.current_lot;
    var leading = lot && lot.current_bidder_id === t.id;
    var pct = t.purse_total ? (t.purse_left / t.purse_total) * 100 : 0;

    var squad = board.players.filter(function (p) {
      return p.team_id === t.id && p.status === "sold";
    }).sort(function (x, y) { return (x.sort_order || 0) - (y.sort_order || 0); });

    function row(label, value) {
      return '<dl class="auc-teamrow"><dt>' + label + "</dt><dd>" + value + "</dd></dl>";
    }

    panel.innerHTML =
      '<div class="auc-teampanel" style="--team-color:' + esc(t.color) + '">' +
        "<h4>" + esc(t.name) +
          (leading ? ' <span style="color:var(--primary-gold); font-size:0.7rem;">◆ LEADING</span>' : "") +
        "</h4>" +

        row("Captain", a.captain ? esc(a.captain) : '<span class="auc-muted">not assigned</span>') +
        row("Vice Captain", a.vice_captain ? esc(a.vice_captain) : '<span class="auc-muted">not assigned</span>') +
        row("Wallet left",
          '<span style="color:var(--primary-gold);">' + money(t.purse_left) + "</span>" +
          '<div class="auc-progress" style="margin:0.35rem 0 0;"><div style="width:' +
          pct.toFixed(1) + '%"></div></div>') +
        row("Spent", money(t.purse_spent) +
          '<div class="auc-muted" style="font-size:0.72rem;">of ' + money(t.purse_total) + "</div>") +
        row("Squad size", t.squad_size +
          (t.total_unmet
            ? ' <span style="color:var(--primary-red); font-size:0.75rem;">(' + t.total_unmet + " short)</span>"
            : ' <span style="color:#22c55e; font-size:0.75rem;">complete</span>')) +
        row("Requirements", '<div class="auc-chips">' + board.categories.map(function (c) {
            var own = (t.owned && t.owned[c.code]) || 0;
            var un = (t.unmet && t.unmet[c.code]) || 0;
            return '<span class="auc-chip ' + (un > 0 ? "short" : "met") + '">' +
              esc(c.short_code) + " " + own + "/" + c.min_per_team + "</span>";
          }).join("") + "</div>") +
        row("Sign-in", a.has_password
          ? '<span class="auc-pill sold">ACTIVE</span>'
          : '<span class="auc-pill in_lot">AWAITING PASSWORD</span>') +

        '<div style="margin-top:0.9rem;">' +
          '<div class="auc-bid-label">Squad</div>' +
          (squad.length
            ? '<ul class="auc-squad-list" style="margin:0.4rem 0 0;">' + squad.map(function (p) {
                var c = catOf(p.category);
                return "<li><span>" +
                  (p.is_retained ? "" : '<span style="font-family:monospace; color:var(--primary-cyan);">#' +
                                        p.sort_order + "</span> ") +
                  esc(p.name) +
                  (p.retained_role
                    ? ' <span class="auc-squad-role">' + esc(p.retained_role.replace("_", " ")) + "</span>"
                    : "") +
                  '<br><span class="auc-muted" style="font-size:0.72rem;">' +
                    esc(c ? c.short_code : p.category) + "</span></span>" +
                  "<span style='font-weight:800;'>" +
                    (p.is_retained ? '<span class="auc-muted">retained</span>' : money(p.sold_price || 0)) +
                  "</span></li>";
              }).join("") + "</ul>"
            : '<div class="auc-muted" style="margin-top:0.4rem;">No players yet</div>') +
        "</div>" +
      "</div>";
  }

  function renderFeed() {
    var events = board.events || [];
    setHTML($("pub-feed"), events.length ? events.map(function (e) {
      return '<div class="auc-feed-item ' + esc(e.kind) + '">' + esc(e.message) +
        '<div class="auc-feed-time">' + new Date(e.created_at).toLocaleTimeString() + "</div></div>";
    }).join("") : '<div class="auc-muted">The auction has not started yet.</div>');
  }

  function renderAllPlayers() {
    AllPlayers.render("pub", board);
  }

  function renderPool() {
    setHTML($("pub-pool"), board.categories.map(function (c) {
      var inCat = board.players.filter(function (p) { return p.category === c.code; });
      var sold = inCat.filter(function (p) { return p.status === "sold"; }).length;
      var uns = inCat.filter(function (p) { return p.status === "unsold"; }).length;
      var pct = inCat.length ? (sold / inCat.length) * 100 : 0;
      return "<tr>" +
        '<td><b style="color:' + esc(c.color) + '">' + esc(c.label) + "</b></td>" +
        "<td>" + money(c.base_price) + "</td>" +
        "<td>" + sold + "</td>" +
        "<td>" + (inCat.length - sold - uns) + "</td>" +
        '<td style="color:' + (uns ? "var(--primary-red)" : "var(--text-muted)") + ';">' + uns + "</td>" +
        '<td style="min-width:120px;"><div class="auc-progress" style="margin:0;">' +
          '<div style="width:' + pct.toFixed(1) + '%"></div></div></td>' +
        "</tr>";
    }).join(""));
  }

  document.addEventListener("DOMContentLoaded", function () {
    AllPlayers.mount("pub-players-host", "pub");
    AllPlayers.wire("pub", function () { if (board) renderAllPlayers(); });
    api = window.createAuctionClient();
    if (!api.ready()) {
      $("pub-status-text").textContent = "NOT CONFIGURED";
      setHTML($("pub-lot"), '<div class="auc-alert info"><i class="fa-solid fa-circle-info"></i>' +
        "<div>Supabase is not configured for this deployment.</div></div>");
      return;
    }
    api.onChange(render);
    api.refresh().then(function () {
      api.subscribe().startPolling(5000);
    }).catch(function (e) {
      console.error(e);
      $("pub-status-text").textContent = "UNAVAILABLE";
      setHTML($("pub-lot"), '<div class="auc-alert info"><i class="fa-solid fa-circle-info"></i>' +
        "<div>The auction has not been set up yet. Check back shortly.</div></div>");
    });
  });
})();
