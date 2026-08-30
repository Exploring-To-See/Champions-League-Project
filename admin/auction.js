/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — ORGANISER AUCTION CONTROL
   Drives the "Auction Control" tab of the Organiser Console.
   Every mutation goes through a Supabase RPC that re-checks the
   rules server side; this file only renders and disables early.
   ============================================================ */

(function () {
  "use strict";

  var E = window.AuctionEngine;
  var CFG = window.CLP_AUCTION_CONFIG;
  var money = E.formatINR;
  var shortMoney = E.formatShort;

  var api = null;
  var board = null;
  var booted = false;
  var derived = E.derive(CFG);

  /* ---------- tiny helpers --------------------------------- */
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
    setTimeout(function () { el.remove(); }, kind === "err" ? 6000 : 3200);
  }

  function fail(err) {
    console.error(err);
    toast((err && err.message) || String(err), "err");
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) {
      btn.dataset.html = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + (label || "Working…");
    } else {
      btn.disabled = false;
      if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
    }
  }

  /* ---------- keeping typed input alive across refreshes ----
     The board reloads every 7 seconds and on every realtime push, and each
     reload used to rebuild these panels with innerHTML. Anything half-typed
     — a sell price, a captain password, a team name — was destroyed
     mid-keystroke, which is why entries kept "resetting".

     So: never rebuild a panel while the operator is working inside it.
     Mark it instead, and redraw the moment focus leaves.               */
  var deferred = {};

  function holdsFocus(host) {
    var a = document.activeElement;
    if (!a || !host) return false;
    if (a === document.body) return false;
    /* An open <select> keeps focus, so this covers dropdowns too. */
    return host.contains(a);
  }

  /* Wraps a render function: draws now, or defers until the operator
     clicks away. `key` just needs to be stable per panel. */
  function renderInto(key, hostId, build) {
    var host = $(hostId);
    if (!host) return;

    if (holdsFocus(host)) {
      if (!deferred[key]) {
        deferred[key] = true;
        host.addEventListener("focusout", function onOut() {
          /* focusout fires before focus lands on its next target, so let
             the browser settle before deciding the panel is really idle. */
          setTimeout(function () {
            if (holdsFocus(host)) return;
            host.removeEventListener("focusout", onOut);
            deferred[key] = false;
            if (board) build(host);
          }, 60);
        });
      }
      return;
    }

    deferred[key] = false;
    build(host);
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

  /* ---------- tab wiring ------------------------------------ */
  function initTabs() {
    document.querySelectorAll("[data-console-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var name = btn.dataset.consoleTab;
        document.querySelectorAll("[data-console-tab]").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
        ["registrations", "auction"].forEach(function (n) {
          var p = $("console-panel-" + n);
          if (p) p.classList.toggle("active", n === name);
        });
        var wrap = document.querySelector(".admin-wrapper");
        if (wrap) wrap.classList.toggle("wide", name === "auction");
        if (name === "auction") boot();
      });
    });

    document.querySelectorAll("[data-auc-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("[data-auc-tab]").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
        ["control", "pool", "squads"].forEach(function (n) {
          var p = $("auc-tab-" + n);
          if (p) p.classList.toggle("active", n === btn.dataset.aucTab);
        });
        /* Captain session counts go stale; re-read them when the tab
           holding them opens, not on every 7-second board poll. */
        if (btn.dataset.aucTab === "squads") refreshAdminAccounts();
      });
    });
  }

  /* ---------- boot ------------------------------------------ */
  function boot() {
    if (booted) return;
    booted = true;
    api = window.createAuctionClient();
    if (!api.ready()) {
      $("auc-setup-hint").style.display = "flex";
      $("auc-setup-hint").innerHTML =
        '<i class="fa-solid fa-triangle-exclamation"></i><div><b>Supabase is not configured.</b> ' +
        'Add your project URL and anon key to <code>js/config.js</code>.</div>';
      return;
    }
    api.onChange(render);
    api.refresh()
      .then(function () { api.subscribe().startPolling(7000); refreshAdminAccounts(); })
      .catch(function (err) {
        $("auc-setup-hint").style.display = "flex";
        console.error(err);
      });
    wireActions();
  }

  /* ---------- render root ----------------------------------- */
  function render(b) {
    board = b;
    if (!b) return;
    $("auc-setup-hint").style.display = "none";
    keepScroll(function () {
    section("photos", function () { OnBlockCard.preload(board.players); });
    section("status", renderStatus);
    section("alerts", renderAlerts);
    section("currentlot", renderCurrentLot);
    section("awardpanel", renderAwardPanel);
    section("teampanels", renderTeamPanels);
    section("randomizer", renderRandomizer);
    section("unsold", renderUnsold);
    section("feed", renderFeed);
    section("pool", renderPool);
    section("teamseditor", renderTeamsEditor);
    section("captainaccounts", renderCaptainAccounts);
    section("squads", renderSquads);
    section("configview", renderConfigView);
    });
    /* After the render: a card that has just gone back to "nobody is on the
       block" would otherwise wipe the overlay as it redraws. */
    section("flash", function () { flash.check(board); });
  }

  function renderStatus() {
    var st = board.state.status;
    var pill = $("auc-status-pill");
    pill.className = "auc-status " + st;
    $("auc-status-text").textContent = st.toUpperCase();

    var total = board.players.length;
    var sold = board.players.filter(function (p) { return p.status === "sold"; }).length;
    var auctionable = board.players.filter(function (p) {
      var c = catOf(p.category);
      return c && !c.is_retained;
    });
    var soldAuction = auctionable.filter(function (p) { return p.status === "sold"; }).length;

    $("auc-status-summary").textContent =
      soldAuction + " of " + auctionable.length + " players sold · " +
      sold + "/" + total + " players placed · " +
      board.teams.length + " teams";

    var pct = auctionable.length ? (soldAuction / auctionable.length) * 100 : 0;
    $("auc-progress-bar").style.width = pct.toFixed(1) + "%";

    $("auc-btn-start").disabled = (st === "live" || st === "completed");
    $("auc-btn-pause").disabled = (st !== "live");
    $("auc-btn-end").disabled = (st === "completed" || st === "setup");
  }

  /* ---------- alerts ---------------------------------------
     Only what the organiser has to act on. The squad-count locks and the
     "cannot be ended yet" bar were advisory noise: with zero slack in three
     categories they fire from the very first player and never clear, so they
     pushed the actual controls off the screen for no gain.

     Compulsory fill stays, because it changes what may happen next — one
     team must take the player at base and nobody may compete. Unsellable
     stays, because those players cannot be placed at all.               */
  function renderAlerts() {
    var host = $("auc-alerts");
    var html = "";
    var a = board.alerts || { forced: [], locked: [] };

    (a.forced || []).forEach(function (f) {
      html += '<div class="auc-alert forced"><i class="fa-solid fa-triangle-exclamation"></i>' +
              '<div><b>COMPULSORY FILL — </b>' + esc(f.message) +
              '<div style="font-weight:500; font-size:0.82rem; opacity:0.85; margin-top:0.2rem;">' +
              'No other team may take this category. Award at base price.</div></div></div>';
    });

    (board.stranded || []).forEach(function (st) {
      html += '<div class="auc-alert locked" style="border-color:var(--primary-red); color:#ffd7df;">' +
              '<i class="fa-solid fa-circle-exclamation"></i><div><b>UNSELLABLE — </b>' +
              esc(st.message) +
              '<div style="font-weight:500; font-size:0.82rem; opacity:0.85; margin-top:0.2rem;">' +
              esc((st.players || []).join(", ")) +
              '. No team has purse above the base price for these.</div></div></div>';
    });

    setHTML(host, html);
  }

  /* ---------- on the block (display only) ------------------- */

  /* Nothing here changes while a player is up, so build once per player.
     Rebuilding on the 7-second refresh is what used to wipe the form that
     lived here; the form has since moved to the Randomizer, but the same
     guard also keeps the fullscreen view from flickering every few seconds. */
  var renderedLotId = null;

  /* Gavel across the On The Block card when a player settles. Mounted on
     that card alone — the organiser asked for it there and nowhere else in
     this console — and it works in full screen because that card IS the
     full screen element. */
  var flash = SoldFlash("auc-current-lot");

  function renderCurrentLot() {
    var host = $("auc-current-lot");
    var lot = board.current_lot;
    var ctx = board.lot_context;

    if (!lot || !ctx) {
      /* No guard on this branch: the wording depends on the auction status,
         which changes without a lot ever opening (reset, start, pause), and
         a "have I drawn this already" check would freeze the old sentence
         on screen. setHTML already skips the write when nothing changed. */
      renderedLotId = null;
      var st = board.state.status;
      var text =
        st === "setup"     ? "The auction has not started yet. Press <b>Start</b> above, then draw." :
        st === "completed" ? "The auction is complete." :
        st === "paused"    ? "The auction is paused. Resume with <b>Start</b> above." :
                             "Nobody is on the block. Use the <b>Randomizer</b> below to draw the next player.";
      var icon = st === "completed" ? "fa-flag-checkered" : "fa-gavel";
      setHTML(host, '<div class="auc-muted" style="padding:1.5rem 0; text-align:center;">' +
        '<i class="fa-solid ' + icon + '" style="font-size:2.2rem; opacity:0.35; display:block; margin-bottom:0.6rem;"></i>' +
        text + "</div>");
      return;
    }

    if (renderedLotId === lot.id) return;
    renderedLotId = lot.id;

    var player = playerById(lot.player_id);
    if (!player) { setHTML(host, ""); return; }

    var cat = catOf(player.category);

    var compulsoryBanner = ctx.compulsory_team_id
      ? '<div class="auc-alert forced" style="margin-top:1rem;">' +
        '<i class="fa-solid fa-gavel"></i><div>Compulsory fill &mdash; <b>' +
        esc(ctx.compulsory_team_name) + '</b> must take this player at base ' +
        money(ctx.base) + '. No other team may compete.</div></div>'
      : "";

    /* Just the card — the same one the room sees on the public view, from
       js/onblock.js. Nothing above it: the card names the player itself, and
       in full screen any heading is only in the way. */
    setHTML(host, window.OnBlockCard.render(player, cat, ctx.base, { logos: true }) + compulsoryBanner);
  }

  /* ---------- selling the drawn player ---------------------- */

  /* Lives in the Randomizer card: draw a number, then allocate that player.
     Built once per player so the refresh cannot replace the dropdown or the
     price box while they are being filled in. */
  var renderedAwardLotId = null;

  function renderAwardPanel() {
    var host = $("auc-award-panel");
    var lot = board.current_lot;
    var ctx = board.lot_context;

    if (!lot || !ctx) {
      if (renderedAwardLotId !== null || host.innerHTML) {
        renderedAwardLotId = null;
        setHTML(host, "");
      }
      return;
    }

    if (renderedAwardLotId === lot.id) return;
    renderedAwardLotId = lot.id;

    var player = playerById(lot.player_id);
    if (!player) { setHTML(host, ""); return; }

    host.innerHTML =
      '<div style="margin-top:1.1rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,0.08);">' +
        '<div class="auc-form-row">' +
          '<div class="auc-field"><label for="auc-award-team">Sold to</label>' +
            '<select id="auc-award-team">' +
              '<option value="">&mdash; pick the winning team &mdash;</option>' +
              ctx.teams.map(function (t) {
                return '<option value="' + esc(t.team_id) + '"' + (t.eligible ? "" : " disabled") + '>' +
                       esc(t.team_name) +
                       (t.eligible ? " — max " + money(t.max_bid) : " — cannot buy in this category") +
                       '</option>';
              }).join("") + '</select></div>' +
          '<div class="auc-field"><label for="auc-award-price">Final price</label>' +
            '<input type="number" id="auc-award-price" step="1000" min="' + ctx.base +
              '" placeholder="' + ctx.base + '" autocomplete="off"></div>' +
          '<div class="auc-field"><button class="auc-btn auc-btn-green" id="auc-btn-award" style="width:100%;">' +
            '<i class="fa-solid fa-gavel"></i> SELL TO TEAM</button></div>' +
        '</div>' +
        '<div class="auc-muted" id="auc-award-hint" style="margin-top:0.5rem;">' +
          esc(player.name) + ' &mdash; base ' + money(ctx.base) +
          '. The price is checked against the max bid of the team you pick.</div>' +
        '<div class="auc-btn-row" style="margin-top:0.8rem;">' +
          '<button class="auc-btn auc-btn-red" id="auc-btn-unsold">' +
            '<i class="fa-solid fa-ban"></i> Mark Unsold</button>' +
        '</div>' +
      '</div>';

    var teamSel = $("auc-award-team");
    var priceInput = $("auc-award-price");

    function showLimit() {
      var row = null;
      (ctx.teams || []).forEach(function (t) { if (t.team_id === teamSel.value) row = t; });
      var hint = $("auc-award-hint");
      if (!row) {
        setHTML(hint, esc(player.name) + " &mdash; base " + money(ctx.base) +
          ". The price is checked against the max bid of the team you pick.");
        return;
      }
      setHTML(hint, "<b>" + esc(row.team_name) + "</b> &mdash; purse " + money(row.purse_left) +
        ", keeps " + money(row.reserve) + " for remaining minimums, so the most it can pay " +
        "here is <b>" + money(row.max_bid) + "</b>.");
      priceInput.max = row.max_bid;
    }
    teamSel.addEventListener("change", showLimit);

    /* No browser confirm. This is the console's main action, once per
       player, and a modal on every one is a click that buys nothing: the
       server still rejects anything below base or above the team's max
       bid, and a mistake is undone from the Player Pool with Revert. */
    $("auc-btn-award").addEventListener("click", function () {
      var teamId = teamSel.value;
      var price = parseInt(priceInput.value, 10);
      if (!teamId) { toast("Pick the winning team", "err"); return; }
      if (!price || isNaN(price)) { toast("Enter the final price", "err"); return; }
      var tName = teamSel.options[teamSel.selectedIndex].text.split(" — ")[0];
      var btn = this;
      busy(btn, true, "Selling…");
      api.awardLot(lot.id, teamId, price)
        .then(function () { toast(player.name + " sold to " + tName + " for " + money(price)); })
        .catch(fail).finally(function () { busy(btn, false); });
    });

    $("auc-btn-unsold").addEventListener("click", function () {
      var btn = this;
      busy(btn, true, "Saving…");
      api.unsoldLot(lot.id).then(function () {
        toast(player.name + " moved to the unsold list");
      }).catch(fail).finally(function () { busy(btn, false); });
    });
  }

  /* ---------- per-team bidding position -------------------- */
  function renderTeamPanels() {
    var host = $("auc-team-panels");
    var ctx = board.lot_context;
    var lot = board.current_lot;

    setHTML(host, board.teams.map(function (t) {
      var row = null;
      if (ctx) {
        for (var i = 0; i < ctx.teams.length; i++) {
          if (ctx.teams[i].team_id === t.id) { row = ctx.teams[i]; break; }
        }
      }

      var chips = board.categories.map(function (c) {
        var own = (t.owned && t.owned[c.code]) || 0;
        var un = (t.unmet && t.unmet[c.code]) || 0;
        return '<span class="auc-chip ' + (un > 0 ? "short" : "met") + '">' +
               esc(c.short_code) + " " + own + "/" + c.min_per_team + '</span>';
      }).join("");

      var leading = lot && lot.current_bidder_id === t.id;
      var cls = "auc-team" + (leading ? " leading" : "") +
                (row && !row.eligible ? " ineligible" : "");

      var reasonCls = row ? (row.eligible ? "good" : "warn") : "";
      var reason = row ? row.reason : (t.complete ? "Squad complete" : "No lot open");

      return '<div class="' + cls + '" style="--team-color:' + esc(t.color) + '">' +
        '<div class="auc-team-name"><span>' + esc(t.name) + '</span>' +
          (leading ? '<span style="color:var(--primary-gold); font-size:0.7rem;">◆ LEADING</span>' : '') +
        '</div>' +
        '<div class="auc-kv"><span>Purse left</span><span style="color:var(--primary-gold);">' +
          money(t.purse_left) + '</span></div>' +
        '<div class="auc-kv"><span>Reserve held</span><span>' + money(t.reserve) + '</span></div>' +
        '<div class="auc-kv"><span>Max bid (this lot)</span><span style="color:var(--primary-cyan);">' +
          (row ? money(row.max_bid) : "—") + '</span></div>' +
        '<div class="auc-kv"><span>Squad</span><span>' + t.squad_size + " / " + derived.minSquad +
          (t.total_unmet ? ' <span style="color:var(--primary-red);">(' + t.total_unmet + ' short)</span>' : '') +
          '</span></div>' +
        '<div class="auc-chips">' + chips + '</div>' +
        '<div class="auc-reason ' + reasonCls + '">' + esc(reason) + '</div>' +
        '</div>';
    }).join(""));
  }

  /* ---------- randomizer ------------------------------------ */

  /* Who is still in the pool. Retained captains and vice captains are
     pre-assigned and never drawn. */
  function drawablePlayers() {
    return board.players.filter(function (p) {
      var c = catOf(p.category);
      return c && !c.is_retained && !p.is_retained && p.status === "available";
    });
  }

  function renderRandomizer() {
    var pool = drawablePlayers();
    var open = !!board.current_lot;
    var live = board.state.status === "live" || board.state.status === "paused";

    $("auc-draw-remaining").textContent = pool.length + " of " +
      board.players.filter(function (p) {
        var c = catOf(p.category);
        return c && !c.is_retained && !p.is_retained;
      }).length + " left in the pool";

    $("auc-btn-draw").disabled = open || !pool.length || !live;

    var note;
    if (board.state.status === "setup") note = "Press Start to go live before drawing.";
    else if (board.state.status === "completed") note = "The auction is closed.";
    else if (open) note = "Finish the player on the block (sell or mark unsold) before drawing again.";
    else if (!pool.length) {
      var parked = unsoldPlayers().length;
      note = parked
        ? "The pool is empty. " + parked + " player(s) went unsold — place them by hand " +
          "using their player ID below, or Re-open from the unsold list."
        : "Every player has been drawn and placed.";
    } else note = "Draws one of the remaining " + pool.length +
      " at random, across all categories. A number never comes up twice: drawing " +
      "takes the player out of the pool for good, sold or unsold.";
    $("auc-draw-note").textContent = note;

    $("auc-manual-note").textContent = board.state.status === "setup"
      ? "Available once the auction is live."
      : "Any player ID from 1 to 56 — the only way to bring an unsold player back up.";

    /* The player currently on the block is the live draw result. */
    var host = $("auc-draw-display");
    var lot = board.current_lot;
    var drawn = lot ? playerById(lot.player_id) : null;
    if (drawn) {
      var dc = catOf(drawn.category);
      host.innerHTML =
        '<div style="text-align:center; padding:1.1rem 0;">' +
          '<div class="auc-bid-label">Drawn number</div>' +
          '<div style="font-family:var(--font-heading); font-weight:900; font-size:3.4rem; ' +
            'line-height:1; color:var(--primary-gold);">' + drawn.sort_order + "</div>" +
          '<div style="font-family:var(--font-heading); font-weight:900; font-size:1.5rem; ' +
            'margin-top:0.4rem;">' + esc(drawn.name) + "</div>" +
          '<span class="auc-cat-badge" style="color:' + esc(dc ? dc.color : "#00e5ff") + '">' +
            esc(dc ? dc.label : drawn.category) + " · base " + money(dc ? dc.base_price : 0) +
          "</span>" +
        "</div>";
    } else {
      setHTML(host, '<div class="auc-muted" style="text-align:center; padding:1.4rem 0;">' +
        '<i class="fa-solid fa-dice" style="font-size:2.4rem; opacity:0.35; display:block; ' +
        'margin-bottom:0.6rem;"></i>' +
        (pool.length ? "Press draw to pull the next number."
                     : "No numbers left to draw.") + "</div>");
    }

    /* Everyone already out of the pool, by number. */
    var done = board.players.filter(function (p) {
      var c = catOf(p.category);
      return c && !c.is_retained && !p.is_retained && p.status !== "available";
    }).sort(function (a, b) { return a.sort_order - b.sort_order; });

    setHTML($("auc-draw-history"), done.length
      ? done.map(function (p) {
          return '<span class="auc-chip met" title="' + esc(p.name) + '">' +
                 p.sort_order + "</span>";
        }).join("")
      : '<span class="auc-muted">None yet.</span>');
  }

  /* ---------- unsold list ----------------------------------- */

  /* Parked, not pooled: the randomizer draws only from 'available', so
     anything here has to be brought back by hand. */
  function unsoldPlayers() {
    return board.players.filter(function (p) {
      var c = catOf(p.category);
      return c && !c.is_retained && !p.is_retained && p.status === "unsold";
    }).sort(function (a, b) { return a.sort_order - b.sort_order; });
  }

  function renderUnsold() {
    var rows = unsoldPlayers();
    var open = !!board.current_lot;
    var live = board.state.status === "live" || board.state.status === "paused";

    $("auc-unsold-count").textContent = rows.length + (rows.length === 1 ? " player" : " players");

    if (holdsFocus($("auc-unsold-body"))) return;
    setHTML($("auc-unsold-body"), rows.length ? rows.map(function (p) {
      var c = catOf(p.category);
      return "<tr>" +
        '<td style="font-family:monospace; font-weight:800; color:var(--primary-gold);">' +
          p.sort_order + "</td>" +
        "<td><b>" + esc(p.name) + "</b></td>" +
        '<td style="color:' + esc(c ? c.color : "#00e5ff") + '; font-weight:700;">' +
          esc(c ? c.label : p.category) + "</td>" +
        "<td>" + money(c ? c.base_price : 0) + "</td>" +
        '<td style="text-align:center;">' + (p.unsold_count || 1) + "</td>" +
        '<td><button class="auc-btn auc-btn-cyan auc-reopen" data-serial="' + p.sort_order +
          '" style="padding:0.4rem 0.7rem; font-size:0.78rem;"' +
          (open || !live ? " disabled" : "") + '>' +
          '<i class="fa-solid fa-rotate-left"></i> Re-open</button></td>' +
      "</tr>";
    }).join("")
      : '<tr><td colspan="6" style="text-align:center; padding:1.6rem; color:var(--text-muted);">' +
        "Nobody has gone unsold.</td></tr>");

    document.querySelectorAll(".auc-reopen").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var b = btn; busy(b, true, "Opening…");
        api.openBySerial(parseInt(btn.dataset.serial, 10))
          .catch(fail).finally(function () { busy(b, false); });
      });
    });
  }

  function playerById(id) {
    if (!board || !id) return null;
    for (var i = 0; i < board.players.length; i++) {
      if (board.players[i].id === id) return board.players[i];
    }
    return null;
  }

  /* ---------- live feed ------------------------------------- */
  function renderFeed() {
    var host = $("auc-feed");
    var events = board.events || [];
    if (!events.length) {
      setHTML(host, '<div class="auc-muted">Nothing has happened yet.</div>');
      return;
    }
    setHTML(host, events.map(function (e) {
      return '<div class="auc-feed-item ' + esc(e.kind) + '">' +
        esc(e.message) +
        '<div class="auc-feed-time">' + new Date(e.created_at).toLocaleTimeString() + '</div></div>';
    }).join(""));
  }

  /* ---------- player pool ----------------------------------- */
  function renderPool() {
    var newCat = $("auc-new-cat");
    if (!newCat.options.length) {
      setHTML(newCat, board.categories.map(function (c) {
        return '<option value="' + esc(c.code) + '">' + esc(c.label) + '</option>';
      }).join(""));
    }
    var filter = $("auc-pool-filter");
    if (filter.options.length <= 1) {
      setHTML(filter, '<option value="ALL">All categories</option>' +
        board.categories.map(function (c) {
          return '<option value="' + esc(c.code) + '">' + esc(c.label) + '</option>';
        }).join(""));
    }

    /* Pool composition against the configured target */
    var teamsCount = board.config.teams_count;
    var healthy = true;
    setHTML($("auc-pool-summary"), board.categories.map(function (c) {
      var inPool = board.players.filter(function (p) { return p.category === c.code; }).length;
      var sold = board.players.filter(function (p) { return p.category === c.code && p.status === "sold"; }).length;
      var left = inPool - sold;
      var slack = inPool - teamsCount * c.min_per_team;
      var ok = inPool === c.pool_count;
      if (!ok) healthy = false;
      return "<tr>" +
        '<td><b style="color:' + esc(c.color) + '">' + esc(c.label) + "</b></td>" +
        "<td>" + money(c.base_price) + "</td>" +
        '<td style="color:' + (ok ? "#22c55e" : "var(--primary-red)") + '; font-weight:800;">' + inPool + "</td>" +
        "<td>" + c.pool_count + "</td>" +
        "<td>" + c.min_per_team + "</td>" +
        '<td style="color:' + (slack < 0 ? "var(--primary-red)" : slack === 0 ? "var(--primary-gold)" : "#22c55e") +
          '; font-weight:800;">' + slack + "</td>" +
        "<td>" + sold + "</td><td>" + left + "</td></tr>";
    }).join(""));

    setHTML($("auc-pool-health"), healthy
      ? '<span class="auc-pill sold" style="margin-left:0.5rem;">POOL MATCHES CONFIG</span>'
      : '<span class="auc-pill in_lot" style="margin-left:0.5rem;">POOL DOES NOT MATCH CONFIG</span>');

    /* Player rows */
    var q = ($("auc-pool-search").value || "").toLowerCase().trim();
    var fcat = filter.value || "ALL";
    var fstatus = ($("auc-pool-status") || {}).value || "ALL";
    var rows = board.players.slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    }).filter(function (p) {
      if (fcat !== "ALL" && p.category !== fcat) return false;
      if (fstatus !== "ALL" && p.status !== fstatus) return false;
      return !q || p.name.toLowerCase().indexOf(q) >= 0;
    });

    var teamOpts = board.teams.map(function (t) {
      return '<option value="' + esc(t.id) + '">' + esc(t.name) + "</option>";
    }).join("");

    if (holdsFocus($("auc-pool-body"))) return;
    setHTML($("auc-pool-body"), rows.length ? rows.map(function (p) {
      var c = catOf(p.category);
      var team = teamOf(p.team_id);
      var retainedCell = "—";
      if (c && c.is_retained) {
        retainedCell =
          '<select class="auc-retain-team" data-player="' + esc(p.id) + '" style="max-width:130px;">' +
            '<option value="">— unassigned —</option>' + teamOpts + '</select>' +
          '<select class="auc-retain-role" data-player="' + esc(p.id) + '" style="max-width:110px; margin-top:0.25rem;">' +
            '<option value="CAPTAIN">Captain</option><option value="VICE_CAPTAIN">Vice Captain</option></select>';
      }
      return "<tr>" +
        '<td style="font-family:monospace; font-weight:800; color:var(--primary-gold);">' +
          (p.is_retained ? "&mdash;" : p.sort_order) + "</td>" +
        "<td><b>" + esc(p.name) + "</b></td>" +
        '<td><select class="auc-row-cat" data-player="' + esc(p.id) + '"' +
          (p.status === "sold" ? " disabled" : "") + ' style="max-width:150px;">' +
          board.categories.map(function (cc) {
            return '<option value="' + esc(cc.code) + '"' + (cc.code === p.category ? " selected" : "") +
                   ">" + esc(cc.label) + "</option>";
          }).join("") + "</select></td>" +
        '<td><input type="text" class="auc-row-ach" data-player="' + esc(p.id) +
          '" value="' + esc(p.achievement || "") + '" placeholder="—" autocomplete="off"' +
          ' style="width:170px; font-size:0.82rem;' +
          (p.achievement ? " color:var(--primary-gold); font-weight:700;" : "") + '"></td>' +
        '<td><span class="auc-pill ' + esc(p.status) + '">' +
          esc(p.status === "in_lot" ? "on the block" : p.status) + "</span></td>" +
        "<td>" + (team ? '<span style="color:' + esc(team.color) + '; font-weight:700;">' + esc(team.name) + "</span>" : "—") + "</td>" +
        "<td>" + (p.sold_price !== null && p.sold_price !== undefined ? money(p.sold_price) : "—") + "</td>" +
        "<td>" + retainedCell + "</td>" +
        '<td style="white-space:nowrap;">' +
          (p.status === "sold" && !p.is_retained
            ? '<button class="action-btn-sm btn-edit auc-revert" data-player="' + esc(p.id) +
              '" title="Revert sale"><i class="fa-solid fa-rotate-left"></i></button>' : "") +
          '<button class="action-btn-sm btn-delete auc-del" data-player="' + esc(p.id) +
            '" title="Delete player"><i class="fa-solid fa-trash"></i></button>' +
        "</td></tr>";
    }).join("")
      : '<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-muted);">No players match.</td></tr>');

    /* Reflect current retained assignment in the selects */
    board.players.forEach(function (p) {
      var ts = document.querySelector('.auc-retain-team[data-player="' + p.id + '"]');
      if (ts) ts.value = p.team_id || "";
      var rs = document.querySelector('.auc-retain-role[data-player="' + p.id + '"]');
      if (rs && p.retained_role) rs.value = p.retained_role;
    });

    /* Saved when the operator leaves the cell, not on every keystroke —
       and the pool table already refuses to redraw while focus is in it,
       so typing here is safe from the refresh. */
    document.querySelectorAll(".auc-row-ach").forEach(function (input) {
      var initial = input.value;
      input.addEventListener("change", function () {
        if (input.value === initial) return;
        var id = input.dataset.player;
        api.setAchievement(id, input.value)
          .then(function () { initial = input.value; return api.refresh(); })
          .then(function () { toast("Achievement saved"); })
          .catch(function (e) { input.value = initial; fail(e); });
      });
    });

    document.querySelectorAll(".auc-row-cat").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var p = null, id = sel.dataset.player;
        for (var i = 0; i < board.players.length; i++) if (board.players[i].id === id) p = board.players[i];
        if (!p) return;
        api.upsertPlayer(id, p.name, sel.value, p.photo_url, p.registration_id, p.sort_order)
          .then(function () { return api.refresh(); })
          .then(function () { toast("Category updated"); })
          .catch(fail);
      });
    });

    function applyRetained(id) {
      var ts = document.querySelector('.auc-retain-team[data-player="' + id + '"]');
      var rs = document.querySelector('.auc-retain-role[data-player="' + id + '"]');
      api.setRetained(id, ts.value || null, rs ? rs.value : "CAPTAIN")
        .then(function () { return api.refresh(); })
        .then(function () { toast(ts.value ? "Retained player assigned" : "Retained assignment cleared"); })
        .catch(fail);
    }
    document.querySelectorAll(".auc-retain-team").forEach(function (sel) {
      sel.addEventListener("change", function () { applyRetained(sel.dataset.player); });
    });
    document.querySelectorAll(".auc-retain-role").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var ts = document.querySelector('.auc-retain-team[data-player="' + sel.dataset.player + '"]');
        if (ts && ts.value) applyRetained(sel.dataset.player);
      });
    });

    document.querySelectorAll(".auc-revert").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("Revert this sale? The purse is refunded and the player returns to the pool.")) return;
        api.revertSale(btn.dataset.player)
          .then(function () { toast("Sale reverted"); }).catch(fail);
      });
    });

    document.querySelectorAll(".auc-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("Delete this player from the auction pool?")) return;
        api.deletePlayer(btn.dataset.player)
          .then(function () { return api.refresh(); })
          .then(function () { toast("Player removed"); }).catch(fail);
      });
    });
  }

  /* ---------- teams & captain passwords --------------------- */
  function renderTeamsEditor() {
    renderInto("teams", "auc-teams-editor", function (host) {
    setHTML(host, board.teams.map(function (t) {
      return '<div class="auc-card" style="border-top:3px solid ' + esc(t.color) + ';">' +
        '<div class="auc-card-title" style="color:' + esc(t.color) + ';">' +
          '<i class="fa-solid fa-shield"></i> ' + esc(t.name) +
          '<span class="auc-muted" style="font-weight:500; letter-spacing:0; text-transform:none;">' +
            ' — captain login code <b>' + esc(t.code) + '</b></span>' +
          (t.has_password
            ? '<span class="auc-pill sold">PASSWORD SET</span>'
            : '<span class="auc-pill in_lot">NO PASSWORD</span>') +
        '</div>' +
        '<div class="auc-form-row">' +
          '<div class="auc-field"><label>Team name</label>' +
            '<input type="text" class="auc-t-name" data-team="' + esc(t.id) + '" value="' + esc(t.name) + '"></div>' +
          '<div class="auc-field"><label>Short name</label>' +
            '<input type="text" class="auc-t-short" data-team="' + esc(t.id) + '" value="' + esc(t.short_name || "") + '"></div>' +
          '<div class="auc-field"><label>Colour</label>' +
            '<input type="text" class="auc-t-color" data-team="' + esc(t.id) + '" value="' + esc(t.color) + '"></div>' +
          '<div class="auc-field"><label>Purse</label>' +
            '<input type="number" class="auc-t-purse" data-team="' + esc(t.id) + '" value="' + t.purse_total + '"></div>' +
          '<div class="auc-field"><button class="auc-btn auc-btn-cyan auc-t-save" data-team="' +
            esc(t.id) + '" style="width:100%;"><i class="fa-solid fa-floppy-disk"></i> Save</button></div>' +
        '</div>' +
        '<div class="auc-form-row" style="margin-top:0.8rem;">' +
          '<div class="auc-field"><label>Set captain password</label>' +
            '<input type="text" class="auc-t-pw" data-team="' + esc(t.id) +
            '" placeholder="min 4 characters" autocomplete="off"></div>' +
          '<div class="auc-field"><button class="auc-btn auc-btn-gold auc-t-pw-save" data-team="' +
            esc(t.id) + '" style="width:100%;"><i class="fa-solid fa-key"></i> Set Password</button></div>' +
        '</div>' +
        '<div class="auc-kv" style="margin-top:0.7rem;"><span>Spent</span><span>' +
          money(t.purse_spent) + " of " + money(t.purse_total) + '</span></div>' +
      '</div>';
    }).join(""));

    document.querySelectorAll(".auc-t-save").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.team;
        var g = function (c) { return document.querySelector("." + c + '[data-team="' + id + '"]').value; };
        busy(btn, true, "Saving…");
        api.updateTeam(id, g("auc-t-name"), g("auc-t-short"), g("auc-t-color"),
                       parseInt(g("auc-t-purse"), 10) || null)
          .then(function () { return api.refresh(); })
          .then(function () { toast("Team saved"); })
          .catch(fail).finally(function () { busy(btn, false); });
      });
    });

    document.querySelectorAll(".auc-t-pw-save").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.team;
        var input = document.querySelector('.auc-t-pw[data-team="' + id + '"]');
        if (!input.value || input.value.length < 4) { toast("Password must be at least 4 characters", "err"); return; }
        busy(btn, true, "Saving…");
        api.setTeamPassword(id, input.value)
          .then(function () { return api.refresh(); })
          .then(function () { input.value = ""; toast("Captain password set"); })
          .catch(fail).finally(function () { busy(btn, false); });
      });
    });
    });
  }

  /* ---------- captain logins -------------------------------- */

  /* Plaintext lives here only between "Generate" and the next reload —
     the database keeps a bcrypt hash and nothing else, so this sheet is
     the one and only chance to copy the passwords out. */
  var issued = [];

  /* password_set_at / active_sessions come from an admin-only RPC, not from
     the board — the board is served to the anon key on the public page.
     Fetched alongside each board render and merged in by team id. */
  var adminAccounts = {};
  var adminAccountsPending = false;

  function refreshAdminAccounts() {
    if (!api || adminAccountsPending) return;
    adminAccountsPending = true;
    api.captainAdminAccounts().then(function (rows) {
      adminAccounts = {};
      (rows || []).forEach(function (r) { adminAccounts[r.team_id] = r; });
      if (board) renderCaptainAccounts();
    }).catch(function () {
      /* Not signed in yet, or the schema predates this RPC — the tab still
         renders from the board, just without the two extra columns. */
    }).finally(function () { adminAccountsPending = false; });
  }

  function captainConsoleUrl() {
    var base = (window.CLP_NAV && window.CLP_NAV.urlFor("CAPTAIN")) || "/captain";
    if (base.indexOf("http") === 0) return base;
    return window.location.origin + base;
  }

  function renderCredsSheet() {
    var host = $("auc-creds-sheet");
    var copyBtn = $("auc-btn-copy-creds");
    var csvBtn = $("auc-btn-download-creds");

    if (!issued.length) {
      setHTML(host, "");
      copyBtn.style.display = "none";
      csvBtn.style.display = "none";
      return;
    }

    copyBtn.style.display = "";
    csvBtn.style.display = "";

    host.innerHTML =
      '<div class="auc-alert forced" style="margin-bottom:1rem;">' +
        '<i class="fa-solid fa-triangle-exclamation"></i>' +
        "<div><b>Copy these now — they are shown once.</b> Only a bcrypt hash is stored, " +
        "so a lost password can be reissued but never recovered. Any captain already " +
        "signed in on an old password has been signed out.</div></div>" +
      '<div class="auc-table-box" style="margin-bottom:1.2rem;">' +
        '<table class="auc-table"><thead><tr>' +
          "<th>Team</th><th>Login Code</th><th>Password</th><th>Console</th>" +
        "</tr></thead><tbody>" +
        issued.map(function (c) {
          return "<tr>" +
            '<td><b style="color:' + esc(c.color) + '">' + esc(c.team_name) + "</b></td>" +
            '<td style="font-family:monospace; font-weight:800; color:var(--primary-cyan);">' +
              esc(c.team_code) + "</td>" +
            '<td style="font-family:monospace; font-size:1.05rem; font-weight:800; ' +
              'color:var(--primary-gold); letter-spacing:1px;">' + esc(c.password) + "</td>" +
            '<td class="auc-muted" style="font-size:0.78rem;">' + esc(captainConsoleUrl()) + "</td>" +
          "</tr>";
        }).join("") +
        "</tbody></table></div>";
  }

  function credsText() {
    return issued.map(function (c) {
      return c.team_name + "\n" +
             "  Console : " + captainConsoleUrl() + "\n" +
             "  Code    : " + c.team_code + "\n" +
             "  Password: " + c.password;
    }).join("\n\n");
  }

  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast(okMsg); }
      catch (e) { toast("Copy failed — select the text manually", "err"); }
      ta.remove();
    }
    /* navigator.clipboard needs a secure context; the venue may be on
       plain http, so keep the textarea path as a real fallback. */
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else {
      fallback();
    }
  }

  function renderCaptainAccounts() {
    var accounts = board.captains || [];
    var withPw = accounts.filter(function (a) { return a.has_password; }).length;

    $("auc-captain-url").value = captainConsoleUrl();
    setHTML($("auc-captains-health"), accounts.length
      ? (withPw === accounts.length
          ? '<span class="auc-pill sold">ALL ' + accounts.length + " CAPTAINS CAN SIGN IN</span>"
          : '<span class="auc-pill in_lot">' + withPw + " of " + accounts.length +
            " captains have a password</span>")
      : "");

    if (holdsFocus($("auc-captains-body"))) return;
    setHTML($("auc-captains-body"), accounts.length ? accounts.map(function (a) {
      var extra = adminAccounts[a.team_id] || {};
      var pwCell = a.has_password
        ? '<span class="auc-pill sold">SET</span>' +
          (extra.password_set_at
            ? '<div class="auc-muted" style="font-size:0.72rem; margin-top:0.2rem;">' +
              new Date(extra.password_set_at).toLocaleString() + "</div>"
            : "")
        : '<span class="auc-pill in_lot">NOT SET</span>';

      return "<tr>" +
        '<td><b style="color:' + esc(a.color) + '">' + esc(a.team_name) + "</b></td>" +
        '<td style="font-family:monospace; font-weight:800; color:var(--primary-cyan);">' +
          esc(a.team_code) + "</td>" +
        "<td>" + (a.captain ? esc(a.captain) : '<span class="auc-muted">not assigned</span>') + "</td>" +
        "<td>" + (a.vice_captain ? esc(a.vice_captain) : '<span class="auc-muted">not assigned</span>') + "</td>" +
        "<td>" + pwCell + "</td>" +
        "<td>" + (extra.active_sessions > 0
          ? '<span class="auc-pill available">' + extra.active_sessions + "</span>"
          : '<span class="auc-muted">—</span>') + "</td>" +
        '<td style="color:var(--primary-gold); font-weight:700;">' + money(a.purse_left) + "</td>" +
        '<td><button class="auc-btn auc-btn-ghost auc-gen-one" data-team="' + esc(a.team_id) +
          '" style="padding:0.4rem 0.7rem; font-size:0.78rem;">' +
          '<i class="fa-solid fa-rotate"></i> Reissue</button></td>' +
      "</tr>";
    }).join("")
      : '<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">' +
        "No teams yet — run <b>Setup → Sync Config</b> first.</td></tr>");

    document.querySelectorAll(".auc-gen-one").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.team;
        var team = null;
        accounts.forEach(function (a) { if (a.team_id === id) team = a; });
        if (!confirm("Issue a new password for " + (team ? team.team_name : "this team") +
                     "?\n\nThe current password stops working immediately and that " +
                     "captain is signed out.")) return;
        busy(btn, true, "Issuing…");
        api.generatePasswords(id)
          .then(function (rows) {
            issued = rows || [];
            renderCredsSheet();
            refreshAdminAccounts();
            return api.refresh();
          })
          .then(function () { toast("New password issued"); })
          .catch(fail).finally(function () { busy(btn, false); });
      });
    });
  }

  /* ---------- final squads ---------------------------------- */
  function renderSquads() {
    setHTML($("auc-squads"), board.teams.map(function (t) {
      var squad = board.players.filter(function (p) {
        return p.team_id === t.id && p.status === "sold";
      });
      var chips = board.categories.map(function (c) {
        var own = (t.owned && t.owned[c.code]) || 0;
        var un = (t.unmet && t.unmet[c.code]) || 0;
        return '<span class="auc-chip ' + (un > 0 ? "short" : "met") + '">' +
               esc(c.short_code) + " " + own + "/" + c.min_per_team + "</span>";
      }).join("");

      return '<div class="auc-card" style="border-top:3px solid ' + esc(t.color) + ';">' +
        '<div class="auc-card-title" style="color:' + esc(t.color) + ';">' + esc(t.name) +
          '<span class="auc-pill ' + (t.total_unmet ? "in_lot" : "sold") + '">' +
            squad.length + ' players</span></div>' +
        '<div class="auc-kv"><span>Spent</span><span>' + money(t.purse_spent) + "</span></div>" +
        '<div class="auc-kv"><span>Remaining</span><span style="color:var(--primary-gold);">' +
          money(t.purse_left) + "</span></div>" +
        '<div class="auc-chips">' + chips + "</div>" +
        '<ul class="auc-squad-list">' + (squad.length ? squad.map(function (p) {
          var c = catOf(p.category);
          return "<li><span>" + esc(p.name) +
            (p.retained_role ? ' <span class="auc-squad-role">' +
              esc(p.retained_role.replace("_", " ")) + "</span>" : "") +
            '<br><span class="auc-muted" style="font-size:0.72rem;">' +
              esc(c ? c.short_code : p.category) + "</span></span>" +
            "<span style='font-weight:800;'>" + money(p.sold_price || 0) + "</span></li>";
        }).join("") : '<li class="auc-muted">No players yet</li>') + "</ul></div>";
    }).join(""));
  }

  /* ---------- derived config read-out ----------------------- */
  function renderConfigView() {
    var teamsCount = board.config.teams_count;
    var reserve = 0, rows = "";
    board.categories.forEach(function (c) {
      if (!c.is_retained) reserve += c.min_per_team * c.base_price;
    });
    var totalSlack = 0;
    board.categories.forEach(function (c) {
      var slack = c.pool_count - teamsCount * c.min_per_team;
      if (slack > 0) totalSlack += slack;
      rows += "<tr><td><b>" + esc(c.label) + "</b></td><td>" + money(c.base_price) +
        "</td><td>" + c.pool_count + "</td><td>" + c.min_per_team + "</td><td>" +
        teamsCount * c.min_per_team + '</td><td style="font-weight:800; color:' +
        (slack === 0 ? "var(--primary-gold)" : "#22c55e") + ';">' + slack + "</td></tr>";
    });

    var minSquad = board.categories.reduce(function (a, c) { return a + c.min_per_team; }, 0);

    $("auc-config-view").innerHTML =
      '<div class="auc-stats">' +
        '<div class="auc-stat"><b>' + shortMoney(board.config.purse) + "</b><span>Purse / team</span></div>" +
        '<div class="auc-stat"><b>' + shortMoney(reserve) + "</b><span>Min reserve wallet</span></div>" +
        '<div class="auc-stat"><b>' + minSquad + "</b><span>Min squad</span></div>" +
        '<div class="auc-stat"><b>' + (minSquad + totalSlack) + "</b><span>Max squad (pool-bound)</span></div>" +
        '<div class="auc-stat"><b>' + board.players.length + "</b><span>Players in pool</span></div>" +
        '<div class="auc-stat"><b>' + teamsCount + "</b><span>Teams</span></div>" +
      "</div>" +
      '<div class="auc-table-box"><table class="auc-table"><thead><tr>' +
        "<th>Category</th><th>Base</th><th>Pool</th><th>Min/Team</th><th>Committed</th><th>Slack</th>" +
        "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<p class="auc-muted" style="margin-top:0.7rem;">' +
        "Min reserve wallet and slack are computed from the pool counts — they are never hardcoded. " +
        "Categories with zero slack can never be bought as a surplus.</p>";
  }

  /* ---------- actions --------------------------------------- */
  function wireActions() {
    $("auc-btn-start").addEventListener("click", function () {
      var b = this; busy(b, true, "Starting…");
      api.setStatus("live").then(function () { toast("Auction is LIVE"); })
        .catch(fail).finally(function () { busy(b, false); });
    });

    $("auc-btn-pause").addEventListener("click", function () {
      var b = this; busy(b, true, "Pausing…");
      api.setStatus("paused").then(function () { toast("Auction paused"); })
        .catch(fail).finally(function () { busy(b, false); });
    });

    $("auc-btn-end").addEventListener("click", function () {
      if (!confirm("End the auction? This closes bidding for everyone.")) return;
      var b = this; busy(b, true, "Closing…");
      api.setStatus("completed").then(function () { toast("Auction complete"); })
        .catch(fail).finally(function () { busy(b, false); });
    });

    $("auc-btn-draw").addEventListener("click", function () {
      var b = this; busy(b, true, "Drawing…");
      /* The server picks the number. Asking the browser to shuffle would let
         a draw be re-rolled until it produced a convenient name. */
      api.drawRandom()
        .then(function () {
          var lot = board && board.current_lot;
          var p = lot ? playerById(lot.player_id) : null;
          if (p) toast("Drawn #" + p.sort_order + " — " + p.name);
        })
        .catch(fail).finally(function () { busy(b, false); });
    });
    $("auc-pool-search").addEventListener("input", renderPool);
    $("auc-pool-filter").addEventListener("change", renderPool);
    $("auc-pool-status").addEventListener("change", renderPool);

    $("auc-btn-add-player").addEventListener("click", function () {
      var name = $("auc-new-name").value.trim();
      var cat = $("auc-new-cat").value;
      if (!name) { toast("Enter a player name", "err"); return; }
      var b = this; busy(b, true, "Adding…");
      api.upsertPlayer(null, name, cat, null, null, board.players.length + 1)
        .then(function () { return api.refresh(); })
        .then(function () { $("auc-new-name").value = ""; toast(name + " added"); })
        .catch(fail).finally(function () { busy(b, false); });
    });


    $("auc-btn-sync").addEventListener("click", function () {
      var b = this; busy(b, true, "Syncing…");
      api.syncConfig(CFG).then(function () { toast("Config synced to Supabase"); })
        .catch(fail).finally(function () { busy(b, false); });
    });

    $("auc-btn-reset-top").addEventListener("click", resetAuction);

    /* Blow the current player up for the room. Native fullscreen on top of
       the CSS overlay where the browser allows it; the overlay alone is
       enough if it refuses. */
    var fsCard = $("auc-block-card");
    function setFs(on) {
      fsCard.classList.toggle("auc-fullscreen", on);
      document.body.classList.toggle("auc-fs-open", on);
      /* Nothing on screen once it is up — Escape is the way out, and the
         browser says so itself when it grants native fullscreen. */
      $("auc-btn-fullscreen").style.display = on ? "none" : "";
      try {
        if (on && fsCard.requestFullscreen) fsCard.requestFullscreen();
        else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      } catch (e) { /* overlay already does the job */ }
    }
    $("auc-btn-fullscreen").addEventListener("click", function () {
      setFs(!fsCard.classList.contains("auc-fullscreen"));
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && fsCard.classList.contains("auc-fullscreen")) setFs(false);
    });
    /* Leaving native fullscreen by any other route must drop the overlay too. */
    document.addEventListener("fullscreenchange", function () {
      if (!document.fullscreenElement && fsCard.classList.contains("auc-fullscreen")) setFs(false);
    });

    $("auc-btn-open-serial").addEventListener("click", function () {
      var input = $("auc-manual-serial");
      var n = parseInt(input.value, 10);
      if (!n || isNaN(n)) { toast("Enter a player ID", "err"); return; }
      var b = this; busy(b, true, "Opening…");
      api.openBySerial(n)
        .then(function () { input.value = ""; })
        .catch(fail).finally(function () { busy(b, false); });
    });

    /* Enter in the ID box opens that player. */
    $("auc-manual-serial").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); $("auc-btn-open-serial").click(); }
    });

    $("auc-btn-export-squads").addEventListener("click", exportSquads);
    $("auc-btn-backup").addEventListener("click", exportBackup);

    /* ---- captain logins ---- */
    $("auc-btn-copy-url").addEventListener("click", function () {
      copyText(captainConsoleUrl(), "Captain console link copied");
    });

    $("auc-btn-gen-all").addEventListener("click", function () {
      var n = (board && board.captains ? board.captains.length : 0);
      if (!n) { toast("No teams yet — run Setup → Sync Config first", "err"); return; }
      if (!confirm("Issue a fresh password for all " + n + " captains?\n\n" +
                   "Every existing captain password stops working immediately and " +
                   "anyone signed in is signed out. The new passwords are shown once.")) return;
      var b = this;
      busy(b, true, "Issuing…");
      api.generatePasswords(null)
        .then(function (rows) {
          issued = rows || [];
          renderCredsSheet();
          refreshAdminAccounts();
          return api.refresh();
        })
        .then(function () { toast(issued.length + " captain passwords issued"); })
        .catch(fail).finally(function () { busy(b, false); });
    });

    $("auc-btn-copy-creds").addEventListener("click", function () {
      if (!issued.length) return;
      copyText(credsText(), "All credentials copied");
    });

    $("auc-btn-download-creds").addEventListener("click", function () {
      if (!issued.length) return;
      var head = ["Team", "Login Code", "Password", "Captain Console"];
      var lines = [head.join(",")].concat(issued.map(function (c) {
        return [c.team_name, c.team_code, c.password, captainConsoleUrl()]
          .map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(",");
      }));
      var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "1727_CL2_Captain_Logins.csv";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });
  }

  /* Wipes every sale and the unsold list, restores full purses and puts all
     56 players back in the pool. Retained captains and vice captains survive.

     Confirmed in the page, not through prompt(). The typed-phrase dialog was
     unreliable in two ways: the phrase is case-sensitive, so "reset auction"
     silently cancelled, and a browser that has been told to block dialogs —
     which is easy to do by accident — makes prompt() return null, so the
     button appeared dead. Arming the button instead cannot be suppressed and
     cannot be mistyped, and it still takes two deliberate clicks. */
  var resetArmed = false;
  var resetTimer = null;

  function disarmReset() {
    clearTimeout(resetTimer);
    resetArmed = false;
    var btn = $("auc-btn-reset-top");
    if (!btn) return;
    btn.classList.remove("armed");
    if (btn.dataset.resetHtml) {
      btn.innerHTML = btn.dataset.resetHtml;
      delete btn.dataset.resetHtml;
    }
  }

  function resetAuction() {
    var btn = $("auc-btn-reset-top");
    if (!btn) return;

    if (!resetArmed) {
      resetArmed = true;
      btn.dataset.resetHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> CONFIRM RESET';
      btn.classList.add("armed");
      toast("Click CONFIRM RESET again to undo every sale and refill the pool. " +
            "Cancels itself in 8 seconds.", "err");
      resetTimer = setTimeout(disarmReset, 8000);
      return;
    }

    disarmReset();
    busy(btn, true, "Resetting…");
    api.resetAuction("RESET AUCTION")
      .then(function () { toast("Auction reset — all 56 back in the pool"); })
      .catch(fail)
      .finally(function () { busy(btn, false); });
  }

  /* ---------- backup workbook ------------------------------
     A restorable snapshot of the auction, not a pretty report: every
     figure the Player Pool tab derives, plus the teams and their squads,
     each on its own sheet. Money is written as a plain number so the
     sheet can be summed; the rupee grouping is a display detail. */
  function exportBackup() {
    if (!board) { toast("Nothing loaded yet", "err"); return; }

    var stamp = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var stampText = stamp.getFullYear() + "-" + pad(stamp.getMonth() + 1) + "-" +
                    pad(stamp.getDate()) + " " + pad(stamp.getHours()) + ":" +
                    pad(stamp.getMinutes());
    var fileStamp = stampText.replace(/[: ]/g, "-");

    var cats = board.categories || [];
    var teams = board.teams || [];
    var players = (board.players || []).slice()
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    var auctionable = players.filter(function (p) {
      var c = catOf(p.category);
      return c && !c.is_retained;
    });
    var accounts = {};
    (board.captains || []).forEach(function (a) { accounts[a.team_id] = a; });

    /* ---- 1. Summary ---- */
    var summary = [
      ["1727 Champion's League 2.0 — Auction Backup"],
      ["Generated", stampText],
      ["Auction status", board.state.status],
      [],
      ["Players in pool", players.length],
      ["Auctionable (excludes retained)", auctionable.length],
      ["Sold", auctionable.filter(function (p) { return p.status === "sold"; }).length],
      ["Still in pool", auctionable.filter(function (p) { return p.status === "available"; }).length],
      ["Unsold", auctionable.filter(function (p) { return p.status === "unsold"; }).length],
      ["On the block", auctionable.filter(function (p) { return p.status === "in_lot"; }).length],
      ["Retained captains / vice captains",
        players.filter(function (p) { return p.is_retained; }).length],
      [],
      ["Teams", teams.length],
      ["Purse per team", board.config.purse],
      ["Total spent", teams.reduce(function (a, t) { return a + t.purse_spent; }, 0)],
      ["Total remaining", teams.reduce(function (a, t) { return a + t.purse_left; }, 0)]
    ];

    /* ---- 2. Player Pool: what the tab shows, column for column ---- */
    var pool = [["ID", "Player", "Category", "Previous Achievement", "Status",
                 "Team", "Price Paid", "Base Price", "Retained Role", "Times Unsold"]];
    players.forEach(function (p) {
      var c = catOf(p.category);
      var t = teamOf(p.team_id);
      pool.push([
        p.is_retained ? "" : p.sort_order,
        p.name,
        c ? c.label : p.category,
        p.achievement || "",
        p.status === "in_lot" ? "on the block" : p.status,
        t ? t.name : "",
        p.status === "sold" && !p.is_retained ? p.sold_price : "",
        c ? c.base_price : "",
        p.retained_role ? p.retained_role.replace("_", " ") : "",
        p.unsold_count || 0
      ]);
    });

    /* ---- 3. Pool Composition: the derived numbers in that tab ---- */
    var teamsCount = board.config.teams_count;
    var comp = [["Category", "Base Price", "In Pool", "Target", "Min / Team",
                 "Committed", "Slack", "Sold", "Unsold", "Left"]];
    cats.forEach(function (c) {
      var inCat = players.filter(function (p) { return p.category === c.code; });
      var sold = inCat.filter(function (p) { return p.status === "sold"; }).length;
      var uns = inCat.filter(function (p) { return p.status === "unsold"; }).length;
      comp.push([c.label, c.base_price, inCat.length, c.pool_count, c.min_per_team,
                 teamsCount * c.min_per_team, inCat.length - teamsCount * c.min_per_team,
                 sold, uns, inCat.length - sold - uns]);
    });

    /* ---- 4. Teams ---- */
    var head = ["Team", "Code", "Captain", "Vice Captain", "Purse", "Spent",
                "Remaining", "Squad Size", "Minimums Short"];
    cats.forEach(function (c) { head.push(c.short_code + " owned / min"); });
    var teamRows = [head];
    teams.forEach(function (t) {
      var a = accounts[t.id] || {};
      var row = [t.name, t.code, a.captain || "", a.vice_captain || "",
                 t.purse_total, t.purse_spent, t.purse_left, t.squad_size, t.total_unmet];
      cats.forEach(function (c) {
        row.push(((t.owned && t.owned[c.code]) || 0) + " / " + c.min_per_team);
      });
      teamRows.push(row);
    });

    /* ---- 5. Squads: one row per player, grouped by team ---- */
    var squads = [["Team", "ID", "Player", "Category", "Price Paid", "Retained Role"]];
    teams.forEach(function (t) {
      players.filter(function (p) { return p.team_id === t.id && p.status === "sold"; })
        .forEach(function (p) {
          var c = catOf(p.category);
          squads.push([
            t.name,
            p.is_retained ? "" : p.sort_order,
            p.name,
            c ? c.label : p.category,
            p.is_retained ? 0 : p.sold_price,
            p.retained_role ? p.retained_role.replace("_", " ") : ""
          ]);
        });
    });

    var blob = MiniXlsx.build([
      { name: "Summary",          rows: summary },
      { name: "Player Pool",      rows: pool },
      { name: "Pool Composition", rows: comp },
      { name: "Teams",            rows: teamRows },
      { name: "Squads",           rows: squads }
    ]);

    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "1727_CL2_Auction_Backup_" + fileStamp + ".xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup downloaded — " + players.length + " players, " + teams.length + " teams");
  }

  function exportSquads() {
    if (!board) return;
    var head = ["Team", "Player", "Category", "Base Price", "Sold Price", "Retained Role"];
    var lines = [head.join(",")];
    board.teams.forEach(function (t) {
      board.players.filter(function (p) { return p.team_id === t.id && p.status === "sold"; })
        .forEach(function (p) {
          var c = catOf(p.category);
          lines.push([t.name, p.name, c ? c.label : p.category,
                      c ? c.base_price : 0, p.sold_price || 0,
                      p.retained_role || ""]
                     .map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(","));
        });
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "1727_CL2_Auction_Squads_" + Date.now() + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  document.addEventListener("DOMContentLoaded", initTabs);
})();
