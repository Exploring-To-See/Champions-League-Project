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
    renderTeams();
    renderFeed();
    renderSquads();
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
    var spend = board.teams.reduce(function (a, t) { return a + t.purse_spent; }, 0);
    var top = board.players.filter(function (p) { return p.status === "sold" && p.sold_price; })
      .sort(function (a, b) { return b.sold_price - a.sold_price; })[0];

    $("pub-stats").innerHTML =
      '<div class="auc-stat"><b>' + sold.length + " / " + auctionable.length + "</b><span>Lots sold</span></div>" +
      '<div class="auc-stat"><b style="color:var(--primary-gold);">' + shortMoney(spend) +
        "</b><span>Total spend</span></div>" +
      '<div class="auc-stat"><b>' + (top ? shortMoney(top.sold_price) : "—") +
        "</b><span>Top buy</span></div>" +
      '<div class="auc-stat"><b style="font-size:1rem; line-height:1.5;">' +
        (top ? esc(top.name) : "—") + "</b><span>Most expensive</span></div>" +
      '<div class="auc-stat"><b>' + board.teams.length + "</b><span>Teams</span></div>" +
      '<div class="auc-stat"><b>' + (auctionable.length - sold.length) + "</b><span>Still in pool</span></div>";
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
            '<div class="auc-muted" style="margin-top:0.5rem;">Waiting for the next lot…</div>' +
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

  function renderTeams() {
    $("pub-teams").innerHTML = board.teams.map(function (t) {
      var lot = board.current_lot;
      var leading = lot && lot.current_bidder_id === t.id;
      var pct = t.purse_total ? (t.purse_left / t.purse_total) * 100 : 0;
      return '<div class="auc-team' + (leading ? " leading" : "") +
        '" style="--team-color:' + esc(t.color) + '">' +
        '<div class="auc-team-name"><span>' + esc(t.name) + "</span>" +
          (leading ? '<span style="color:var(--primary-gold); font-size:0.7rem;">◆ LEADING</span>' : "") +
        "</div>" +
        '<div class="auc-kv"><span>Purse left</span><span style="color:var(--primary-gold);">' +
          money(t.purse_left) + "</span></div>" +
        '<div class="auc-kv"><span>Squad</span><span>' + t.squad_size + "</span></div>" +
        '<div class="auc-progress"><div style="width:' + pct.toFixed(1) + '%"></div></div>' +
        "</div>";
    }).join("");
  }

  function renderFeed() {
    var events = board.events || [];
    $("pub-feed").innerHTML = events.length ? events.map(function (e) {
      return '<div class="auc-feed-item ' + esc(e.kind) + '">' + esc(e.message) +
        '<div class="auc-feed-time">' + new Date(e.created_at).toLocaleTimeString() + "</div></div>";
    }).join("") : '<div class="auc-muted">The auction has not started yet.</div>';
  }

  function renderSquads() {
    $("pub-squads").innerHTML = board.teams.map(function (t) {
      var squad = board.players.filter(function (p) {
        return p.team_id === t.id && p.status === "sold";
      });
      return '<div class="auc-card" style="margin:0; border-top:3px solid ' + esc(t.color) + ';">' +
        '<div class="auc-card-title" style="color:' + esc(t.color) + '; font-size:0.95rem;">' +
          esc(t.name) + '<span class="auc-pill available">' + squad.length + " players</span></div>" +
        '<ul class="auc-squad-list">' + (squad.length ? squad.map(function (p) {
          var c = catOf(p.category);
          return "<li><span>" + esc(p.name) +
            (p.retained_role ? ' <span class="auc-squad-role">' +
              esc(p.retained_role.replace("_", " ")) + "</span>" : "") +
            '<br><span class="auc-muted" style="font-size:0.72rem;">' +
              esc(c ? c.short_code : p.category) + "</span></span>" +
            "<span style='font-weight:800;'>" + money(p.sold_price || 0) + "</span></li>";
        }).join("") : '<li class="auc-muted">No players yet</li>') + "</ul></div>";
    }).join("");
  }

  function renderPool() {
    $("pub-pool").innerHTML = board.categories.map(function (c) {
      var inPool = board.players.filter(function (p) { return p.category === c.code; });
      var sold = inPool.filter(function (p) { return p.status === "sold"; }).length;
      var pct = inPool.length ? (sold / inPool.length) * 100 : 0;
      return "<tr>" +
        '<td><b style="color:' + esc(c.color) + '">' + esc(c.label) + "</b></td>" +
        "<td>" + money(c.base_price) + "</td>" +
        "<td>" + sold + "</td>" +
        "<td>" + (inPool.length - sold) + "</td>" +
        '<td style="min-width:120px;"><div class="auc-progress" style="margin:0;">' +
          '<div style="width:' + pct.toFixed(1) + '%"></div></div></td>' +
        "</tr>";
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", function () {
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
