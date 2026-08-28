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
        ["control", "pool", "teams", "captains", "squads", "setup"].forEach(function (n) {
          var p = $("auc-tab-" + n);
          if (p) p.classList.toggle("active", n === btn.dataset.aucTab);
        });
        /* Session counts go stale; re-read them when the tab is opened
           rather than on every 7-second board poll. */
        if (btn.dataset.aucTab === "captains") refreshAdminAccounts();
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
    renderStatus();
    renderAlerts();
    renderCurrentLot();
    renderTeamPanels();
    renderQueue();
    renderFeed();
    renderPool();
    renderTeamsEditor();
    renderCaptainAccounts();
    renderSquads();
    renderConfigView();
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
      soldAuction + " of " + auctionable.length + " lots sold · " +
      sold + "/" + total + " players placed · " +
      board.teams.length + " teams";

    var pct = auctionable.length ? (soldAuction / auctionable.length) * 100 : 0;
    $("auc-progress-bar").style.width = pct.toFixed(1) + "%";

    $("auc-btn-start").disabled = (st === "live" || st === "completed");
    $("auc-btn-pause").disabled = (st !== "live");
    $("auc-btn-end").disabled = (st === "completed" || st === "setup");
  }

  /* ---------- Rule 4 alerts + Rule 6 end guard -------------- */
  function renderAlerts() {
    var host = $("auc-alerts");
    var html = "";
    var a = board.alerts || { forced: [], locked: [] };

    (a.forced || []).forEach(function (f) {
      html += '<div class="auc-alert forced"><i class="fa-solid fa-triangle-exclamation"></i>' +
              '<div><b>COMPULSORY FILL — </b>' + esc(f.message) +
              '<div style="font-weight:500; font-size:0.82rem; opacity:0.85; margin-top:0.2rem;">' +
              'No other team may bid on this category. Open the lot and award at base.</div></div></div>';
    });

    /* Count locks fire constantly in zero-slack categories (all four teams,
       three categories, from lot one). Collapsed so the forced alerts above
       and the controls below stay visible. */
    var locked = a.locked || [];
    if (locked.length) {
      var cats = [];
      locked.forEach(function (l) {
        if (cats.indexOf(l.category_label) < 0) cats.push(l.category_label);
      });
      html += '<details class="auc-alert locked" style="display:block;">' +
        '<summary style="cursor:pointer; list-style:none;">' +
        '<i class="fa-solid fa-lock"></i> <b>' + locked.length + ' squad count lock' +
        (locked.length === 1 ? '' : 's') + ' in effect</b> — ' + esc(cats.join(", ")) +
        '<span class="auc-muted" style="margin-left:0.4rem;">(bidding continues normally)</span>' +
        '</summary><ul style="margin:0.6rem 0 0 1.2rem; font-size:0.85rem; line-height:1.6;">' +
        locked.map(function (l) { return "<li>" + esc(l.message) + "</li>"; }).join("") +
        '</ul></details>';
    }

    (board.stranded || []).forEach(function (st) {
      html += '<div class="auc-alert locked" style="border-color:var(--primary-red); color:#ffd7df;">' +
              '<i class="fa-solid fa-circle-exclamation"></i><div><b>UNSELLABLE — </b>' +
              esc(st.message) +
              '<div style="font-weight:500; font-size:0.82rem; opacity:0.85; margin-top:0.2rem;">' +
              esc((st.players || []).join(", ")) +
              '. Every minimum is still safe, but no purse remains above base. ' +
              'Re-queueing these lots will not sell them.</div></div></div>';
    });

    var ec = board.end_check || {};
    if (board.state.status !== "completed") {
      if (ec.can_end) {
        html += '<div class="auc-alert ok"><i class="fa-solid fa-circle-check"></i><div>' +
                'Every team has met all of its minimums — the auction can be closed.</div></div>';
      } else if ((ec.blockers || []).length) {
        var byTeam = {};
        (ec.blockers || []).forEach(function (b) {
          byTeam[b.team_name] = (byTeam[b.team_name] || 0) + b.short;
        });
        var summary = Object.keys(byTeam).map(function (n) {
          return esc(n) + " (" + byTeam[n] + ")";
        }).join(", ");
        var lines = (ec.blockers || []).map(function (b) {
          var names = (b.players || []).slice(0, 4).join(", ");
          var more = (b.players || []).length > 4 ? " +" + ((b.players || []).length - 4) + " more" : "";
          return "<li><b>" + esc(b.team_name) + "</b> still needs " + b.short + " × " +
                 esc(b.category_label) + " — unsold: " + esc(names) + esc(more) + "</li>";
        }).join("");
        html += '<details class="auc-alert info" style="display:block;">' +
          '<summary style="cursor:pointer; list-style:none;">' +
          '<i class="fa-solid fa-hourglass-half"></i> <b>Auction cannot be ended yet</b> — ' +
          'minimums still short: ' + summary + '</summary>' +
          '<ul style="margin:0.6rem 0 0 1.2rem; font-size:0.85rem; line-height:1.6;">' +
          lines + '</ul></details>';
      }
    }

    host.innerHTML = html;
  }

  /* ---------- the lot on the block -------------------------- */
  function renderCurrentLot() {
    var host = $("auc-current-lot");
    var lot = board.current_lot;
    var ctx = board.lot_context;

    if (!lot || !ctx) {
      host.innerHTML = '<div class="auc-muted" style="padding:1.5rem 0; text-align:center;">' +
        '<i class="fa-solid fa-gavel" style="font-size:2.2rem; opacity:0.35; display:block; margin-bottom:0.6rem;"></i>' +
        'No lot is open. Pick a player under <b>Next Lot</b> below.</div>';
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

    var compulsoryBanner = "";
    if (ctx.compulsory_team_id) {
      compulsoryBanner =
        '<div class="auc-alert forced" style="margin-top:0.9rem;">' +
        '<i class="fa-solid fa-gavel"></i><div>Compulsory fill — <b>' +
        esc(ctx.compulsory_team_name) + '</b> must take this player at base ' +
        money(ctx.base) + '. No other team may bid.</div></div>';
    }

    host.innerHTML =
      '<div class="auc-lot">' + photo +
      '<div style="width:100%;">' +
        '<div class="auc-lot-name">' + esc(player.name) + '</div>' +
        '<span class="auc-cat-badge" style="color:' + esc(cat ? cat.color : "#00e5ff") + '">' +
          esc(cat ? cat.label : player.category) + ' · base ' + money(ctx.base) + '</span>' +
        (player.unsold_count ? '<span class="auc-muted" style="margin-left:0.6rem;">re-queued ×' +
            player.unsold_count + '</span>' : '') +
        '<div class="auc-bid-row">' +
          '<div><div class="auc-bid-label">Current Bid</div>' +
            '<div class="auc-bid-now">' + (ctx.current_bid === null ? "—" : money(ctx.current_bid)) + '</div></div>' +
          '<div><div class="auc-bid-label">Leading</div>' +
            '<div style="font-family:var(--font-heading); font-weight:900; font-size:1.35rem; color:' +
              (leader ? esc(leader.color) : "var(--text-muted)") + ';">' +
              (leader ? esc(leader.name) : "No bids yet") + '</div></div>' +
          '<div><div class="auc-bid-label">Next Valid Bid</div>' +
            '<div style="font-family:var(--font-heading); font-weight:900; font-size:1.35rem; color:var(--primary-cyan);">' +
              money(ctx.next_bid) + '</div>' +
            '<div class="auc-muted" style="font-size:0.72rem;">step ' + money(ctx.step) + '</div></div>' +
          '<div><div class="auc-bid-label">Left in ' + esc(cat ? cat.short_code : "") + '</div>' +
            '<div style="font-family:var(--font-heading); font-weight:900; font-size:1.35rem;">' +
              ctx.remaining + '</div></div>' +
        '</div>' +
        compulsoryBanner +
        '<div class="auc-form-row" style="margin-top:1.1rem;">' +
          '<div class="auc-field"><label for="auc-custom-bid">Organiser custom bid (respects max bid)</label>' +
            '<input type="number" id="auc-custom-bid" step="1000" placeholder="' + ctx.next_bid + '"></div>' +
          '<div class="auc-field"><label for="auc-custom-team">On behalf of</label>' +
            '<select id="auc-custom-team">' + ctx.teams.map(function (t) {
              return '<option value="' + esc(t.team_id) + '"' + (t.eligible ? "" : " disabled") + '>' +
                     esc(t.team_name) + (t.eligible ? "" : " — ineligible") + '</option>';
            }).join("") + '</select></div>' +
          '<div class="auc-field"><button class="auc-btn auc-btn-cyan" id="auc-btn-custom-bid" style="width:100%;">' +
            '<i class="fa-solid fa-hand"></i> Place Bid</button></div>' +
        '</div>' +
        '<div class="auc-btn-row" style="margin-top:1rem;">' +
          '<button class="auc-btn auc-btn-green" id="auc-btn-sell"' +
            (lot.current_bidder_id ? "" : " disabled") + '>' +
            '<i class="fa-solid fa-gavel"></i> SOLD' +
            (leader ? " — " + esc(leader.name) + " " + money(lot.current_bid) : "") + '</button>' +
          '<button class="auc-btn auc-btn-red" id="auc-btn-unsold">' +
            '<i class="fa-solid fa-ban"></i> Mark Unsold</button>' +
        '</div>' +
      '</div></div>';

    $("auc-btn-sell").addEventListener("click", function () {
      var btn = this;
      busy(btn, true, "Selling…");
      api.sellLot(lot.id).then(function () {
        toast("Sold to " + (leader ? leader.name : "team"));
      }).catch(fail).finally(function () { busy(btn, false); });
    });

    $("auc-btn-unsold").addEventListener("click", function () {
      if (!confirm(player.name + " goes unsold and returns to the available pool. Continue?")) return;
      var btn = this;
      busy(btn, true, "Saving…");
      api.unsoldLot(lot.id).then(function () {
        toast(player.name + " returned to the pool");
      }).catch(fail).finally(function () { busy(btn, false); });
    });

    $("auc-btn-custom-bid").addEventListener("click", function () {
      var amount = parseInt($("auc-custom-bid").value, 10);
      var teamId = $("auc-custom-team").value;
      if (!amount || isNaN(amount)) { toast("Enter a bid amount", "err"); return; }
      var btn = this;
      busy(btn, true, "Bidding…");
      api.placeBid(lot.id, teamId, amount, null, "admin")
        .then(function () { toast("Bid recorded"); })
        .catch(fail).finally(function () { busy(btn, false); });
    });
  }

  /* ---------- per-team bidding position -------------------- */
  function renderTeamPanels() {
    var host = $("auc-team-panels");
    var ctx = board.lot_context;
    var lot = board.current_lot;

    host.innerHTML = board.teams.map(function (t) {
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
    }).join("");
  }

  /* ---------- next-lot queue -------------------------------- */
  function renderQueue() {
    var catSel = $("auc-queue-cat");
    var playerSel = $("auc-queue-player");
    var keepCat = catSel.value || "ALL";
    var keepPlayer = playerSel.value;

    if (catSel.options.length <= 1) {
      catSel.innerHTML = '<option value="ALL">All categories</option>' +
        board.categories.filter(function (c) { return !c.is_retained; })
          .map(function (c) { return '<option value="' + esc(c.code) + '">' + esc(c.label) + '</option>'; })
          .join("");
      catSel.value = keepCat;
    }

    var avail = board.players.filter(function (p) {
      var c = catOf(p.category);
      if (!c || c.is_retained) return false;
      if (p.status !== "available") return false;
      return keepCat === "ALL" || p.category === keepCat;
    });

    playerSel.innerHTML = avail.length
      ? avail.map(function (p) {
          var c = catOf(p.category);
          return '<option value="' + esc(p.id) + '">' + esc(p.name) + " — " +
                 esc(c ? c.label : p.category) + " · " + money(c ? c.base_price : 0) +
                 (p.unsold_count ? " (unsold ×" + p.unsold_count + ")" : "") + '</option>';
        }).join("")
      : '<option value="">No players available in this category</option>';

    /* Keep the operator's selection only if that player is still in the
       filtered list — otherwise fall through to the first option, or the
       select ends up with nothing chosen and Open Lot silently no-ops. */
    var stillThere = false;
    for (var oi = 0; oi < playerSel.options.length; oi++) {
      if (playerSel.options[oi].value === keepPlayer) { stillThere = true; break; }
    }
    if (keepPlayer && stillThere) playerSel.value = keepPlayer;
    else if (playerSel.options.length) playerSel.selectedIndex = 0;

    var open = !!board.current_lot;
    $("auc-btn-open-lot").disabled = open || !avail.length || board.state.status === "setup";
    $("auc-btn-random-lot").disabled = open || !avail.length || board.state.status === "setup";

    var note = "";
    if (board.state.status === "setup") note = "Press Start to go live before opening a lot.";
    else if (open) note = "Close the open lot (SOLD or Unsold) before opening the next one.";
    else note = avail.length + " player(s) available" +
      (keepCat === "ALL" ? "" : " in " + (catOf(keepCat) || {}).label) + ".";
    $("auc-queue-note").textContent = note;
  }

  /* ---------- live feed ------------------------------------- */
  function renderFeed() {
    var host = $("auc-feed");
    var events = board.events || [];
    if (!events.length) {
      host.innerHTML = '<div class="auc-muted">Nothing has happened yet.</div>';
      return;
    }
    host.innerHTML = events.map(function (e) {
      return '<div class="auc-feed-item ' + esc(e.kind) + '">' +
        esc(e.message) +
        '<div class="auc-feed-time">' + new Date(e.created_at).toLocaleTimeString() + '</div></div>';
    }).join("");
  }

  /* ---------- player pool ----------------------------------- */
  function renderPool() {
    var newCat = $("auc-new-cat");
    if (!newCat.options.length) {
      newCat.innerHTML = board.categories.map(function (c) {
        return '<option value="' + esc(c.code) + '">' + esc(c.label) + '</option>';
      }).join("");
    }
    var filter = $("auc-pool-filter");
    if (filter.options.length <= 1) {
      filter.innerHTML = '<option value="ALL">All categories</option>' +
        board.categories.map(function (c) {
          return '<option value="' + esc(c.code) + '">' + esc(c.label) + '</option>';
        }).join("");
    }

    /* Pool composition against the configured target */
    var teamsCount = board.config.teams_count;
    var healthy = true;
    $("auc-pool-summary").innerHTML = board.categories.map(function (c) {
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
    }).join("");

    $("auc-pool-health").innerHTML = healthy
      ? '<span class="auc-pill sold" style="margin-left:0.5rem;">POOL MATCHES CONFIG</span>'
      : '<span class="auc-pill in_lot" style="margin-left:0.5rem;">POOL DOES NOT MATCH CONFIG</span>';

    /* Player rows */
    var q = ($("auc-pool-search").value || "").toLowerCase().trim();
    var fcat = filter.value || "ALL";
    var rows = board.players.filter(function (p) {
      if (fcat !== "ALL" && p.category !== fcat) return false;
      return !q || p.name.toLowerCase().indexOf(q) >= 0;
    });

    var teamOpts = board.teams.map(function (t) {
      return '<option value="' + esc(t.id) + '">' + esc(t.name) + "</option>";
    }).join("");

    $("auc-pool-body").innerHTML = rows.length ? rows.map(function (p) {
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
        "<td><b>" + esc(p.name) + "</b></td>" +
        '<td><select class="auc-row-cat" data-player="' + esc(p.id) + '"' +
          (p.status === "sold" ? " disabled" : "") + ' style="max-width:150px;">' +
          board.categories.map(function (cc) {
            return '<option value="' + esc(cc.code) + '"' + (cc.code === p.category ? " selected" : "") +
                   ">" + esc(cc.label) + "</option>";
          }).join("") + "</select></td>" +
        '<td><span class="auc-pill ' + esc(p.status) + '">' + esc(p.status.replace("_", " ")) + "</span></td>" +
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
      : '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No players match.</td></tr>';

    /* Reflect current retained assignment in the selects */
    board.players.forEach(function (p) {
      var ts = document.querySelector('.auc-retain-team[data-player="' + p.id + '"]');
      if (ts) ts.value = p.team_id || "";
      var rs = document.querySelector('.auc-retain-role[data-player="' + p.id + '"]');
      if (rs && p.retained_role) rs.value = p.retained_role;
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
    $("auc-teams-editor").innerHTML = board.teams.map(function (t) {
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
    }).join("");

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
      host.innerHTML = "";
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
    $("auc-captains-health").innerHTML = accounts.length
      ? (withPw === accounts.length
          ? '<span class="auc-pill sold">ALL ' + accounts.length + " CAPTAINS CAN SIGN IN</span>"
          : '<span class="auc-pill in_lot">' + withPw + " of " + accounts.length +
            " captains have a password</span>")
      : "";

    $("auc-captains-body").innerHTML = accounts.length ? accounts.map(function (a) {
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
        "No teams yet — run <b>Setup → Sync Config</b> first.</td></tr>";

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
    $("auc-squads").innerHTML = board.teams.map(function (t) {
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
    }).join("");
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

    $("auc-btn-open-lot").addEventListener("click", function () {
      var id = $("auc-queue-player").value;
      if (!id) { toast("Pick a player first", "err"); return; }
      var b = this; busy(b, true, "Opening…");
      api.openLot(id).catch(fail).finally(function () { busy(b, false); });
    });

    $("auc-btn-random-lot").addEventListener("click", function () {
      var sel = $("auc-queue-player");
      var opts = Array.prototype.filter.call(sel.options, function (o) { return o.value; });
      if (!opts.length) { toast("No players available", "err"); return; }
      var pick = opts[Math.floor(Math.random() * opts.length)];
      var b = this; busy(b, true, "Opening…");
      api.openLot(pick.value).catch(fail).finally(function () { busy(b, false); });
    });

    $("auc-queue-cat").addEventListener("change", renderQueue);
    $("auc-pool-search").addEventListener("input", renderPool);
    $("auc-pool-filter").addEventListener("change", renderPool);

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

    $("auc-btn-import").addEventListener("click", function () {
      var cat = $("auc-new-cat").value;
      var label = (catOf(cat) || {}).label || cat;
      if (!confirm("Import every registration not already in the pool as " + label + "?")) return;
      var b = this; busy(b, true, "Importing…");
      api.importRegistrations(cat)
        .then(function (n) { return api.refresh().then(function () {
          toast(n + " player(s) imported into " + label);
        }); })
        .catch(fail).finally(function () { busy(b, false); });
    });

    $("auc-btn-sync").addEventListener("click", function () {
      var b = this; busy(b, true, "Syncing…");
      api.syncConfig(CFG).then(function () { toast("Config synced to Supabase"); })
        .catch(fail).finally(function () { busy(b, false); });
    });

    $("auc-btn-reset").addEventListener("click", function () {
      var typed = prompt('This clears every bid, lot and sale and restores full purses.\n' +
                         'Type RESET AUCTION to confirm:');
      if (typed !== "RESET AUCTION") { if (typed !== null) toast("Reset cancelled", "err"); return; }
      var b = this; busy(b, true, "Resetting…");
      api.resetAuction("RESET AUCTION").then(function () { toast("Auction reset"); })
        .catch(fail).finally(function () { busy(b, false); });
    });

    $("auc-btn-export-squads").addEventListener("click", exportSquads);

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
