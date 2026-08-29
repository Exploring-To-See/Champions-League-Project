/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — TEAM CAPTAIN CONSOLE
   Sign in by team, then a read-only console: this team's purse, the
   reserve it must hold back, and above all its max bid for the player on
   the block. Bidding happens in the room and the organiser records the
   result, so there is nothing to press here.
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
  /* The teams, read with the anon key before anyone signs in, so a captain
     picks their team by name instead of remembering a code. Names come from
     auction_captain_accounts, which reports who leads each team and whether
     a password has been issued — never the password itself. */
  function loadTeams() {
    var sel = $("cap-team");
    var roster = $("cap-team-roster");
    if (!sel) return;

    api.refresh().then(function (b) {
      var accounts = (b && b.captains) || [];
      if (!accounts.length) {
        sel.innerHTML = '<option value="">No teams have been set up yet</option>';
        roster.innerHTML = "";
        return;
      }

      sel.innerHTML = '<option value="">— choose your team —</option>' +
        accounts.map(function (a) {
          return '<option value="' + esc(a.team_code) + '">' + esc(a.team_name) + "</option>";
        }).join("");

      roster.innerHTML =
        '<div style="color:var(--primary-cyan); font-weight:700; margin-bottom:0.35rem;">' +
          "Captain logins</div>" +
        accounts.map(function (a) {
          var who = [a.captain, a.vice_captain].filter(Boolean).join(" · ");
          return "<div><b style=\"color:" + esc(a.color) + '">' + esc(a.team_name) + "</b> " +
            (who ? "&mdash; " + esc(who) + " " : "") +
            (a.has_password
              ? '<span style="color:#22c55e;">ready</span>'
              : '<span style="color:var(--primary-red);">no password yet</span>') +
            "</div>";
        }).join("");
    }).catch(function () {
      sel.innerHTML = '<option value="">Could not load teams</option>';
    });
  }

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
      var code = $("cap-team").value;
      var pw = $("cap-password").value;
      if (!code) { err.textContent = "Choose your team"; err.style.display = "block"; return; }
      if (!pw) return;

      err.style.display = "none";
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SIGNING IN…';

      api.captainLogin(code, pw).then(function (data) {
        session = data;
        saveSession(session);
        $("cap-password").value = "";
        showConsole();
      }).catch(function (e2) {
        err.textContent = (e2 && e2.message) || "Wrong password for that team";
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

  /* ---------- alerts ----------------------------------------
     Only what changes what this captain can do. The "locked into exactly N
     more X" notices fired from the first player and never cleared — with
     zero slack in three categories they are permanently true — so they just
     buried the console. Compulsory fill stays, because it decides whether
     this team must take the player at base or may not bid at all. */
  function renderAlerts(me) {
    var html = "";
    var alerts = board.alerts || { forced: [] };

    (alerts.forced || []).forEach(function (f) {
      if (f.team_id === me.id) {
        html += '<div class="auc-alert forced"><i class="fa-solid fa-triangle-exclamation"></i>' +
          "<div><b>COMPULSORY — </b>" + esc(f.message) +
          '<div style="font-weight:500; font-size:0.82rem; opacity:0.85; margin-top:0.2rem;">' +
          "These players are yours at base price. No other team can take them.</div></div></div>";
      } else {
        html += '<div class="auc-alert locked"><i class="fa-solid fa-lock"></i><div>' +
          esc(f.message) + " — you cannot take this category.</div></div>";
      }
    });

    $("cap-alerts").innerHTML = html;
  }

  /* ---------- the player on the block -----------------------
     Read-only. Bidding happens in the room, so there is nothing to press
     here: the card is what a captain needs while the bidding runs, and the
     organiser records the result afterwards. */
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

    /* The one number a captain acts on: what this team may pay for THIS
       player, purse less the reserve it must keep for its minimums. */
    var limit = row
      ? '<div class="auc-alert ' + (row.eligible ? "ok" : "locked") + '" style="margin-top:1rem;">' +
        '<i class="fa-solid fa-' + (row.eligible ? "wallet" : "ban") + '"></i>' +
        "<div><b>Your max bid for " + esc(player.name) + ": " +
        '<span class="cap-maxbid" style="font-size:1.5rem;">' + money(row.max_bid) + "</span></b>" +
        '<div style="font-weight:500; font-size:0.85rem; opacity:0.9; margin-top:0.25rem;">' +
        esc(row.reason) + "</div></div></div>"
      : "";

    host.innerHTML = window.OnBlockCard.renderCaptain(player, cat, ctx.base) + limit;
  }

  /* ---------- my squad -------------------------------------- */
  function renderSquad(me) {
    $("cap-squad-count").textContent = me.squad_size + " players";

    var row = myRow();
    $("cap-requirements").innerHTML =
      '<div class="auc-kv" style="margin-bottom:0.7rem;">' +
        "<span>Max bid on the player up now</span>" +
        '<span class="cap-maxbid" style="font-size:1.15rem;">' +
          (row ? money(row.max_bid) : "—") + "</span></div>" +
      '<div class="auc-kv" style="margin-bottom:0.7rem;">' +
        "<span>Purse left &middot; reserve held back</span>" +
        "<span>" + money(me.purse_left) + " &middot; " + money(me.reserve) + "</span></div>" +
      '<div class="auc-chips" style="margin-bottom:0.9rem;">' +
      board.categories.map(function (c) {
        var own = (me.owned && me.owned[c.code]) || 0;
        var un = (me.unmet && me.unmet[c.code]) || 0;
        return '<span class="auc-chip ' + (un > 0 ? "short" : "met") + '">' +
          esc(c.label) + " " + own + "/" + c.min_per_team +
          (un > 0 ? " · need " + un : " ✓") + "</span>";
      }).join("") + "</div>";

    var squad = board.players.filter(function (p) {
      return p.team_id === me.id && p.status === "sold";
    }).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

    $("cap-squad").innerHTML = squad.length ? squad.map(function (p) {
      var c = catOf(p.category);
      return "<li><span>" +
        (p.is_retained ? "" : '<span style="font-family:monospace; color:var(--primary-cyan);">#' +
                              p.sort_order + "</span> ") +
        esc(p.name) +
        (p.retained_role ? ' <span class="auc-squad-role">' +
          esc(p.retained_role.replace("_", " ")) + "</span>" : "") +
        '<br><span class="auc-muted" style="font-size:0.72rem;">' +
          esc(c ? c.label : p.category) + "</span></span>" +
        "<span style='font-weight:800;'>" +
          (p.is_retained ? '<span class="auc-muted">retained</span>' : money(p.sold_price || 0)) +
        "</span></li>";
    }).join("") : '<li class="auc-muted">No players yet</li>';
  }

  /* ---------- the other three teams -------------------------
     Their max bid for the current player is the thing worth knowing — it is
     what they can outbid you by. Squads are folded away so the page stays
     short on a phone; which ones are open survives the refresh. */
  var openRivals = {};

  function renderRivals(me) {
    var ctx = board.lot_context;

    $("cap-rivals").innerHTML = board.teams.filter(function (t) { return t.id !== me.id; })
      .map(function (t) {
        var row = null;
        if (ctx) {
          (ctx.teams || []).forEach(function (r) { if (r.team_id === t.id) row = r; });
        }

        var chips = board.categories.map(function (c) {
          var own = (t.owned && t.owned[c.code]) || 0;
          var un = (t.unmet && t.unmet[c.code]) || 0;
          return '<span class="auc-chip ' + (un > 0 ? "short" : "met") + '">' +
            esc(c.short_code) + " " + own + "/" + c.min_per_team + "</span>";
        }).join("");

        var squad = board.players.filter(function (p) {
          return p.team_id === t.id && p.status === "sold";
        }).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

        var open = !!openRivals[t.id];

        return '<div class="auc-team" style="--team-color:' + esc(t.color) + '">' +
          '<div class="auc-team-name"><span>' + esc(t.name) + "</span></div>" +
          '<div class="auc-kv"><span>Max bid now</span>' +
            '<span class="cap-maxbid">' +
              (row ? (row.eligible ? money(row.max_bid) : "cannot bid") : "—") + "</span></div>" +
          '<div class="auc-kv"><span>Purse left</span><span style="color:var(--primary-gold);">' +
            money(t.purse_left) + "</span></div>" +
          '<div class="auc-kv"><span>Squad</span><span>' + t.squad_size + "</span></div>" +
          '<div class="auc-chips">' + chips + "</div>" +
          '<button class="cap-team-toggle" data-team="' + esc(t.id) + '">' +
            (open ? "Hide team" : "Show team (" + squad.length + ")") + "</button>" +
          (open
            ? '<ul class="auc-squad-list cap-team-squad">' + (squad.length
                ? squad.map(function (p) {
                    var c = catOf(p.category);
                    return "<li><span>" +
                      (p.is_retained ? "" : "#" + p.sort_order + " ") + esc(p.name) + "</span>" +
                      "<span>" + esc(c ? c.label : p.category) + "</span></li>";
                  }).join("")
                : '<li class="auc-muted">No players yet</li>') + "</ul>"
            : "") +
        "</div>";
      }).join("");

    document.querySelectorAll(".cap-team-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.team;
        openRivals[id] = !openRivals[id];
        renderRivals(me);
      });
    });
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
    loadTeams();

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
