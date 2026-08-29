/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — TEAM CAPTAIN CONSOLE
   Password sign-in per team, then a live bidding console showing
   this team's purse, reserve and live max bid. The bid button is
   greyed out with a one-line reason whenever the team is not
   eligible; the server re-checks every rule regardless.
   ============================================================ */

(function () {
  "use strict";

  var E = window.AuctionEngine;
  var money = E.formatINR;
  var shortMoney = E.formatShort;
  var SESSION_KEY = "clp_captain_session";

  var api = null;
  var session = null;   /* { token, team_id, team_name, team_code } */
  var board = null;
  var bidding = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function toast(msg, kind) {
    var el = document.createElement("div");
    el.className = "auc-toast " + (kind === "err" ? "err" : "ok");
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, kind === "err" ? 6000 : 3000);
  }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch (e) { return null; }
  }
  function saveSession(s) {
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* private browsing — session lives in memory only */ }
  }

  /* ---------- login ----------------------------------------- */
  function initLogin() {
    var form = $("cap-login-form");
    var err = $("cap-login-err");
    var btn = $("cap-login-btn");

    $("cap-toggle-pw").addEventListener("click", function () {
      var input = $("cap-password");
      var eye = $("cap-eye");
      var isPw = input.getAttribute("type") === "password";
      input.setAttribute("type", isPw ? "text" : "password");
      eye.className = isPw ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = $("cap-code").value.trim();
      var pw = $("cap-password").value;
      if (!code || !pw) return;

      err.style.display = "none";
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SIGNING IN…';

      api.captainLogin(code, pw).then(function (data) {
        session = data;
        saveSession(session);
        $("cap-password").value = "";
        showConsole();
      }).catch(function (e2) {
        err.textContent = (e2 && e2.message) || "Invalid team code or password";
        err.style.display = "block";
      }).finally(function () {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> SIGN IN';
      });
    });

    $("cap-logout").addEventListener("click", function () {
      if (session && session.token) api.captainLogout(session.token).catch(function () {});
      session = null;
      saveSession(null);
      api.stop();
      $("cap-main").style.display = "none";
      $("cap-login").style.display = "flex";
    });
  }

  function showConsole() {
    $("cap-login").style.display = "none";
    $("cap-main").style.display = "block";
    $("cap-team-name").textContent = session.team_name;
    $("cap-team-sub").textContent = "Team code " + session.team_code;
    api.onChange(render);
    api.refresh().then(function () {
      api.subscribe().startPolling(5000);
    }).catch(function (e) { toast((e && e.message) || "Could not load the auction", "err"); });
  }

  /* ---------- helpers over the board ------------------------ */
  function myTeam() {
    if (!board || !session) return null;
    for (var i = 0; i < board.teams.length; i++) {
      if (board.teams[i].id === session.team_id) return board.teams[i];
    }
    return null;
  }

  function myRow() {
    if (!board || !board.lot_context || !session) return null;
    var rows = board.lot_context.teams || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].team_id === session.team_id) return rows[i];
    }
    return null;
  }

  function catOf(code) {
    if (!board) return null;
    for (var i = 0; i < board.categories.length; i++) {
      if (board.categories[i].code === code) return board.categories[i];
    }
    return null;
  }

  /* ---------- render ---------------------------------------- */
  function render(b) {
    board = b;
    if (!board) return;
    var me = myTeam();
    if (!me) {
      /* team deleted or the stored session points at a stale id */
      toast("This team is no longer in the auction", "err");
      return;
    }
    renderStatus();
    renderStats(me);
    renderAlerts(me);
    renderLot(me);
    renderSquad(me);
    renderRivals(me);
    renderFeed();
  }

  function renderStatus() {
    var st = board.state.status;
    $("cap-status").className = "auc-status " + st;
    $("cap-status-text").textContent = st.toUpperCase();
  }

  function renderStats(me) {
    var row = myRow();
    $("cap-stats").innerHTML =
      '<div class="auc-stat"><b style="color:var(--primary-gold);">' + shortMoney(me.purse_left) +
        "</b><span>Purse left</span></div>" +
      '<div class="auc-stat"><b>' + shortMoney(me.reserve) + "</b><span>Reserve held back</span></div>" +
      '<div class="auc-stat"><b style="color:' + (row && row.eligible ? "#22c55e" : "var(--text-muted)") + ';">' +
        (row ? shortMoney(row.max_bid) : "—") + "</b><span>Max bid this lot</span></div>" +
      '<div class="auc-stat"><b>' + me.squad_size + "</b><span>Squad size</span></div>" +
      '<div class="auc-stat"><b style="color:' + (me.total_unmet ? "var(--primary-red)" : "#22c55e") + ';">' +
        me.total_unmet + "</b><span>Minimums short</span></div>" +
      '<div class="auc-stat"><b>' + shortMoney(me.purse_spent) + "</b><span>Spent</span></div>";
  }

  function renderAlerts(me) {
    var html = "";
    var alerts = board.alerts || { forced: [], locked: [] };

    (alerts.forced || []).forEach(function (f) {
      if (f.team_id === me.id) {
        html += '<div class="auc-alert forced"><i class="fa-solid fa-triangle-exclamation"></i>' +
          "<div><b>COMPULSORY — </b>" + esc(f.message) +
          '<div style="font-weight:500; font-size:0.82rem; opacity:0.85; margin-top:0.2rem;">' +
          "These players are yours at base price. No other team can bid.</div></div></div>";
      } else {
        html += '<div class="auc-alert locked"><i class="fa-solid fa-lock"></i><div>' +
          esc(f.message) + " — you cannot bid in this category.</div></div>";
      }
    });

    (alerts.locked || []).forEach(function (l) {
      if (l.team_id !== me.id) return;
      html += '<div class="auc-alert locked"><i class="fa-solid fa-lock"></i><div>' +
        esc(l.message) + "</div></div>";
    });

    (board.stranded || []).forEach(function (st) {
      html += '<div class="auc-alert locked"><i class="fa-solid fa-circle-exclamation"></i><div>' +
        esc(st.message) + "</div></div>";
    });

    if (me.total_unmet === 0 && me.complete) {
      html += '<div class="auc-alert ok"><i class="fa-solid fa-circle-check"></i><div>' +
        "<b>Squad complete.</b> All minimums met and no surplus is available to you " +
        "under the feasibility guard.</div></div>";
    }

    $("cap-alerts").innerHTML = html;
  }

  function renderLot(me) {
    var host = $("cap-lot");
    var lot = board.current_lot;
    var ctx = board.lot_context;

    if (!lot || !ctx) {
      host.innerHTML = '<div class="auc-muted" style="text-align:center; padding:1.8rem 0;">' +
        '<i class="fa-solid fa-hourglass-half" style="font-size:2.2rem; opacity:0.35; display:block; margin-bottom:0.6rem;"></i>' +
        "Waiting for the auctioneer to draw the next player…</div>";
      return;
    }

    var player = null;
    for (var i = 0; i < board.players.length; i++) {
      if (board.players[i].id === lot.player_id) { player = board.players[i]; break; }
    }
    if (!player) { host.innerHTML = ""; return; }

    var cat = catOf(player.category);
    var row = myRow();
    var leader = null;
    for (var j = 0; j < board.teams.length; j++) {
      if (board.teams[j].id === lot.current_bidder_id) leader = board.teams[j];
    }
    var iLead = lot.current_bidder_id === me.id;

    var photo = player.photo_url
      ? '<img src="' + esc(player.photo_url) + '" class="auc-lot-photo" alt="">'
      : '<div class="auc-lot-photo-empty"><i class="fa-solid fa-user"></i></div>';

    /* Rule 5: captains bid the exact next step. On a compulsory fill the
       price is pinned to base. */
    var isCompulsory = row && row.compulsory;
    var bidAmount = isCompulsory ? ctx.base : ctx.next_bid;
    var canBid = board.state.status === "live" && row && row.eligible && !iLead &&
                 (isCompulsory ? true : row.can_meet_next);

    var label;
    if (board.state.status !== "live") label = "AUCTION " + board.state.status.toUpperCase();
    else if (iLead) label = "YOU ARE LEADING";
    else if (isCompulsory) label = "TAKE AT BASE " + money(ctx.base);
    else if (canBid) label = "BID " + money(bidAmount);
    else label = "CANNOT BID";

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
            '<div style="font-family:var(--font-heading); font-weight:900; font-size:1.3rem; color:' +
              (leader ? esc(leader.color) : "var(--text-muted)") + ';">' +
              (leader ? esc(leader.name) + (iLead ? " (you)" : "") : "No bids yet") + "</div></div>" +
          '<div><div class="auc-bid-label">Your Max Bid</div>' +
            '<div style="font-family:var(--font-heading); font-weight:900; font-size:1.3rem; color:var(--primary-cyan);">' +
              (row ? money(row.max_bid) : "—") + "</div></div>" +
          '<div><div class="auc-bid-label">Left in ' + esc(cat ? cat.short_code : "") + "</div>" +
            '<div style="font-family:var(--font-heading); font-weight:900; font-size:1.3rem;">' +
              ctx.remaining + "</div></div>" +
        "</div>" +
        '<button class="auc-bid-btn' + (isCompulsory ? " compulsory" : "") + '" id="cap-bid-btn"' +
          (canBid && !bidding ? "" : " disabled") + ">" + label + "</button>" +
        '<div class="auc-reason ' + (row && row.eligible ? "good" : "warn") +
          '" style="text-align:center; margin-top:0.6rem; font-size:0.85rem;">' +
          esc(row ? row.reason : "") + "</div>" +
      "</div></div>";

    var btn = $("cap-bid-btn");
    if (btn && canBid) {
      btn.addEventListener("click", function () {
        if (bidding) return;
        bidding = true;
        btn.disabled = true;
        btn.textContent = "PLACING…";
        api.placeBid(lot.id, me.id, bidAmount, session.token, "captain")
          .then(function () { toast("Bid placed: " + money(bidAmount)); })
          .catch(function (e) {
            toast((e && e.message) || "Bid rejected", "err");
            /* A rejected bid usually means the board moved on — resync. */
            return api.refresh().catch(function () {});
          })
          .finally(function () { bidding = false; });
      });
    }
  }

  function renderSquad(me) {
    $("cap-squad-count").textContent = me.squad_size + " players";

    $("cap-requirements").innerHTML = '<div class="auc-chips" style="margin-bottom:0.9rem;">' +
      board.categories.map(function (c) {
        var own = (me.owned && me.owned[c.code]) || 0;
        var un = (me.unmet && me.unmet[c.code]) || 0;
        return '<span class="auc-chip ' + (un > 0 ? "short" : "met") + '">' +
          esc(c.label) + " " + own + "/" + c.min_per_team +
          (un > 0 ? " · need " + un : " ✓") + "</span>";
      }).join("") + "</div>";

    var squad = board.players.filter(function (p) {
      return p.team_id === me.id && p.status === "sold";
    });

    $("cap-squad").innerHTML = squad.length ? squad.map(function (p) {
      var c = catOf(p.category);
      return "<li><span>" + esc(p.name) +
        (p.retained_role ? ' <span class="auc-squad-role">' +
          esc(p.retained_role.replace("_", " ")) + "</span>" : "") +
        '<br><span class="auc-muted" style="font-size:0.72rem;">' +
          esc(c ? c.label : p.category) + "</span></span>" +
        "<span style='font-weight:800;'>" + money(p.sold_price || 0) + "</span></li>";
    }).join("") : '<li class="auc-muted">No players yet</li>';
  }

  function renderRivals(me) {
    $("cap-rivals").innerHTML = board.teams.filter(function (t) { return t.id !== me.id; })
      .map(function (t) {
        var chips = board.categories.map(function (c) {
          var own = (t.owned && t.owned[c.code]) || 0;
          var un = (t.unmet && t.unmet[c.code]) || 0;
          return '<span class="auc-chip ' + (un > 0 ? "short" : "met") + '">' +
            esc(c.short_code) + " " + own + "/" + c.min_per_team + "</span>";
        }).join("");
        return '<div class="auc-team" style="--team-color:' + esc(t.color) + '">' +
          '<div class="auc-team-name"><span>' + esc(t.name) + "</span></div>" +
          '<div class="auc-kv"><span>Purse left</span><span style="color:var(--primary-gold);">' +
            money(t.purse_left) + "</span></div>" +
          '<div class="auc-kv"><span>Squad</span><span>' + t.squad_size + "</span></div>" +
          '<div class="auc-chips">' + chips + "</div></div>";
      }).join("");
  }

  function renderFeed() {
    var events = board.events || [];
    $("cap-feed").innerHTML = events.length ? events.map(function (e) {
      return '<div class="auc-feed-item ' + esc(e.kind) + '">' + esc(e.message) +
        '<div class="auc-feed-time">' + new Date(e.created_at).toLocaleTimeString() + "</div></div>";
    }).join("") : '<div class="auc-muted">Nothing has happened yet.</div>';
  }

  /* ---------- boot ------------------------------------------ */
  document.addEventListener("DOMContentLoaded", function () {
    api = window.createAuctionClient();
    if (!api.ready()) {
      $("cap-login-err").textContent = "Supabase is not configured. Check js/config.js.";
      $("cap-login-err").style.display = "block";
      return;
    }
    initLogin();

    /* Resume a stored session, but only if the server still honours the
       token — it expires after 16 hours, on sign-out, or the moment the
       organiser reissues the team password. Asking the server is the only
       way to know: a token that merely LOOKS well-formed buys nothing,
       because every bid is re-checked against the session table anyway. */
    session = loadSession();
    if (session && session.token) {
      api.captainSession(session.token).then(function (live) {
        if (live && live.team_id) {
          session = live;
          saveSession(session);
          showConsole();
        } else {
          session = null;
          saveSession(null);
        }
      }).catch(function () { session = null; saveSession(null); });
    }
  });
})();
