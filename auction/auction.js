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
    renderStatus();
    renderStats();
    renderLot();
    renderTeamBoard();
    renderFeed();
    renderAllPlayers();
    renderPool();
  }

  function renderStatus() {
    var st = board.state.status;
    $("pub-status").className = "auc-status " + st;
    $("pub-status-text").textContent =
      st === "live" ? "LIVE NOW" :
      st === "paused" ? "PAUSED" :
      st === "completed" ? "AUCTION COMPLETE" : "NOT STARTED";
  }

  function renderStats() {
    var auctionable = board.players.filter(function (p) {
      var c = catOf(p.category);
      return c && !c.is_retained;
    });
    var sold = auctionable.filter(function (p) { return p.status === "sold"; });
    var inPool = auctionable.filter(function (p) { return p.status === "available"; });
    var unsold = auctionable.filter(function (p) { return p.status === "unsold"; });
    var spend = board.teams.reduce(function (a, t) { return a + t.purse_spent; }, 0);
    var top = board.players.filter(function (p) { return p.status === "sold" && p.sold_price; })
      .sort(function (a, b) { return b.sold_price - a.sold_price; })[0];

    $("pub-stats").innerHTML =
      '<div class="auc-stat"><b>' + sold.length + " / " + auctionable.length + "</b><span>Players sold</span></div>" +
      '<div class="auc-stat"><b style="color:var(--primary-gold);">' + shortMoney(spend) +
        "</b><span>Total spend</span></div>" +
      '<div class="auc-stat"><b>' + (top ? shortMoney(top.sold_price) : "—") +
        "</b><span>Top buy</span></div>" +
      '<div class="auc-stat"><b style="font-size:1rem; line-height:1.5;">' +
        (top ? esc(top.name) : "—") + "</b><span>Most expensive</span></div>" +
      '<div class="auc-stat"><b>' + inPool.length + "</b><span>Still in pool</span></div>" +
      '<div class="auc-stat"><b style="color:' + (unsold.length ? "var(--primary-red)" : "inherit") +
        ';">' + unsold.length + "</b><span>Unsold</span></div>";
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
        host.innerHTML = '<div class="auc-muted" style="text-align:center; padding:2rem 0;">' +
          '<i class="fa-solid fa-hourglass-half" style="font-size:2.4rem; opacity:0.35; display:block; margin-bottom:0.7rem;"></i>' +
          "The auction has not opened a lot yet.</div>";
      }
      return;
    }

    var player = null;
    for (var i = 0; i < board.players.length; i++) {
      if (board.players[i].id === lot.player_id) { player = board.players[i]; break; }
    }
    if (!player) { host.innerHTML = ""; return; }

    var cat = catOf(player.category);
    var leader = teamOf(lot.current_bidder_id);
    var photo = player.photo_url
      ? '<img src="' + esc(player.photo_url) + '" class="auc-lot-photo" alt="">'
      : '<div class="auc-lot-photo-empty"><i class="fa-solid fa-user"></i></div>';

    var compulsory = ctx.compulsory_team_id
      ? '<div class="auc-alert forced" style="margin-top:0.9rem;">' +
        '<i class="fa-solid fa-gavel"></i><div>Compulsory fill — <b>' +
        esc(ctx.compulsory_team_name) + "</b> takes this player at base " +
        money(ctx.base) + ".</div></div>"
      : "";

    /* Who is still in the running, for the crowd to follow */
    var chase = (ctx.teams || []).filter(function (t) { return t.can_meet_next; })
      .map(function (t) { return esc(t.team_name); });

    host.innerHTML =
      '<div class="auc-lot">' + photo +
      '<div style="width:100%;">' +
        '<div class="auc-lot-name">' + esc(player.name) + "</div>" +
        '<span class="auc-cat-badge" style="color:' + esc(cat ? cat.color : "#00e5ff") + '">' +
          esc(cat ? cat.label : player.category) + " · base " + money(ctx.base) + "</span>" +
        '<div class="auc-bid-row">' +
          '<div><div class="auc-bid-label">Current Bid</div><div class="auc-bid-now">' +
            (ctx.current_bid === null ? "—" : money(ctx.current_bid)) + "</div></div>" +
          '<div><div class="auc-bid-label">Leading</div>' +
            '<div style="font-family:var(--font-heading); font-weight:900; font-size:1.4rem; color:' +
              (leader ? esc(leader.color) : "var(--text-muted)") + ';">' +
              (leader ? esc(leader.name) : "No bids yet") + "</div></div>" +
          '<div><div class="auc-bid-label">Next Bid</div>' +
            '<div style="font-family:var(--font-heading); font-weight:900; font-size:1.4rem; color:var(--primary-cyan);">' +
              money(ctx.next_bid) + "</div></div>" +
        "</div>" +
        compulsory +
        '<div class="auc-muted" style="margin-top:0.9rem;">' +
          (chase.length ? "Still in the running: <b>" + chase.join(", ") + "</b>"
                        : "No team can meet the next bid — the hammer is about to fall.") +
        "</div>" +
      "</div></div>";
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

    $("pub-teamboard").innerHTML = head + "<tbody>" + rows + "</tbody>";
  }

  /* The whole pool in one table: every player, and which captain bought
     them for how much. Filters are read live so typing re-renders. */
  function renderAllPlayers() {
    var catSel = $("pub-players-cat");
    var teamSel = $("pub-players-team");

    /* Rebuild a filter only when its underlying list actually changed, and
       put the viewer's choice back afterwards. Counting options instead
       would latch: an empty board still writes the fixed "All"/"Not bought
       yet" entries, so the count never falls back to 1 and teams added
       later — the normal case, since the pool is built after the page is
       already open — would never appear. */
    function syncSelect(sel, signature, html) {
      if (sel.dataset.sig === signature) return;
      var prev = sel.value;
      sel.innerHTML = html;
      sel.dataset.sig = signature;
      var kept = false;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === prev) { kept = true; break; }
      }
      sel.value = kept ? prev : "ALL";
    }

    syncSelect(catSel,
      board.categories.map(function (c) { return c.code + ":" + c.label; }).join("|"),
      '<option value="ALL">All categories</option>' +
        board.categories.map(function (c) {
          return '<option value="' + esc(c.code) + '">' + esc(c.label) + "</option>";
        }).join(""));

    syncSelect(teamSel,
      board.teams.map(function (t) { return t.id + ":" + t.name; }).join("|"),
      '<option value="ALL">All teams</option>' +
        board.teams.map(function (t) {
          return '<option value="' + esc(t.id) + '">' + esc(t.name) + "</option>";
        }).join("") + '<option value="NONE">Not bought yet</option>');

    var q = ($("pub-players-search").value || "").toLowerCase().trim();
    var fcat = catSel.value || "ALL";
    var fteam = teamSel.value || "ALL";
    var fstatus = $("pub-players-status").value || "ALL";

    var rows = board.players.slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    }).filter(function (p) {
      if (q && p.name.toLowerCase().indexOf(q) < 0) return false;
      if (fcat !== "ALL" && p.category !== fcat) return false;
      if (fteam === "NONE" && p.team_id) return false;
      if (fteam !== "ALL" && fteam !== "NONE" && p.team_id !== fteam) return false;
      if (fstatus === "sold" && p.status !== "sold") return false;
      if (fstatus === "available" && p.status === "sold") return false;
      return true;
    });

    var soldTotal = board.players.filter(function (p) { return p.status === "sold"; }).length;
    $("pub-players-count").textContent =
      rows.length + " shown · " + soldTotal + " of " + board.players.length + " placed";

    $("pub-players-body").innerHTML = rows.length ? rows.map(function (p) {
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
  }

  function renderFeed() {
    var events = board.events || [];
    $("pub-feed").innerHTML = events.length ? events.map(function (e) {
      return '<div class="auc-feed-item ' + esc(e.kind) + '">' + esc(e.message) +
        '<div class="auc-feed-time">' + new Date(e.created_at).toLocaleTimeString() + "</div></div>";
    }).join("") : '<div class="auc-muted">The auction has not started yet.</div>';
  }

  function renderPool() {
    $("pub-pool").innerHTML = board.categories.map(function (c) {
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
    }).join("");
  }

  /* Filters only re-draw the table, so they stay responsive between the
     five-second board refreshes. */
  function wireFilters() {
    ["pub-players-search", "pub-players-cat", "pub-players-team", "pub-players-status"]
      .forEach(function (id) {
        var el = $(id);
        if (!el) return;
        el.addEventListener(el.tagName === "SELECT" ? "change" : "input", function () {
          if (board) renderAllPlayers();
        });
      });
  }

  /* Point the in-page captain link at the same origin the nav uses. A
     captain's session token is per-origin, so sending them to /captain on
     whichever domain they happen to be reading would hand them an empty
     session store and a second sign-in. */
  function alignCaptainLink() {
    var el = $("pub-captain-link");
    if (el && window.CLP_NAV) el.href = window.CLP_NAV.urlFor("CAPTAIN");
  }

  document.addEventListener("DOMContentLoaded", function () {
    alignCaptainLink();
    wireFilters();
    api = window.createAuctionClient();
    if (!api.ready()) {
      $("pub-status-text").textContent = "NOT CONFIGURED";
      $("pub-lot").innerHTML = '<div class="auc-alert info"><i class="fa-solid fa-circle-info"></i>' +
        "<div>Supabase is not configured for this deployment.</div></div>";
      return;
    }
    api.onChange(render);
    api.refresh().then(function () {
      api.subscribe().startPolling(5000);
    }).catch(function (e) {
      console.error(e);
      $("pub-status-text").textContent = "UNAVAILABLE";
      $("pub-lot").innerHTML = '<div class="auc-alert info"><i class="fa-solid fa-circle-info"></i>' +
        "<div>The auction has not been set up yet. Check back shortly.</div></div>";
    });
  });
})();
