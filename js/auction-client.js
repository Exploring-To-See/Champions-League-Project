/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — AUCTION DATA LAYER
   Shared by the Organiser console, the Team Captain view and the
   public Live view. One Supabase RPC (auction_board) returns the
   whole auction; realtime pushes trigger a refetch.
   ============================================================ */

(function (global) {
  "use strict";

  /* ---- keeping the page still while it refreshes ------------
     Every view re-renders on a 5-7 second poll. Rewriting a tall
     container's innerHTML destroys and rebuilds it, and for the instant
     it is empty the document is shorter — so the browser clamps the
     scroll position, and a reader sitting at the footer gets thrown back
     up the page. That is the scroll "glitch".

     Two defences, in order of preference:
       setHTML   — do not touch the DOM at all when the markup has not
                   changed, which on a quiet poll is every container.
       keepScroll — for the renders that genuinely change, put the reader
                   back where they were once the new content is measured. */

  global.setHTML = function (el, html) {
    if (!el) return;
    if (el.innerHTML === html) return;   /* nothing changed; leave it alone */
    el.innerHTML = html;
  };

  /* Draw one section of a view, and do not let it take the others down.

     A view's render() is a list of independent panels, but it ran as one
     block: the first one to throw stopped every panel after it, and the
     board listener swallows the error, so the page just quietly came up
     half-drawn. That is exactly how a missing renderFeed emptied the
     All Players table below it. Now a broken panel is the only thing that
     breaks, and it says so in the console. */
  global.section = function (name, fn) {
    try {
      fn();
    } catch (e) {
      console.error("[render] " + name + " failed:", e);
    }
  };

  global.keepScroll = function (fn) {
    var y = global.scrollY || global.pageYOffset || 0;
    var before = document.documentElement.scrollHeight;

    fn();

    /* Reading scrollHeight forces layout, so this sees the new height. */
    var after = document.documentElement.scrollHeight;
    var now = global.scrollY || global.pageYOffset || 0;
    if (after !== before && now !== y) {
      /* scrollTo clamps for us, so a page that really did get shorter
         still lands somewhere valid. */
      global.scrollTo(0, y);
    }
  };

  var cfg = global.CLP_CONFIG || {};

  function createClient() {
    if (!global.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
    try {
      return global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    } catch (e) {
      console.error("Supabase init failed:", e);
      return null;
    }
  }

  function AuctionClient(client) {
    this.db = client || createClient();
    this.board = null;
    this.listeners = [];
    this.channel = null;
    this._pending = false;
  }

  AuctionClient.prototype.ready = function () { return !!this.db; };

  /* ---- subscribe to board changes --------------------------- */
  AuctionClient.prototype.onChange = function (fn) {
    this.listeners.push(fn);
    if (this.board) fn(this.board);
    return this;
  };

  AuctionClient.prototype._emit = function () {
    var b = this.board;
    this.listeners.forEach(function (fn) {
      try { fn(b); } catch (e) { console.error("board listener failed:", e); }
    });
  };

  /* ---- read ------------------------------------------------- */
  AuctionClient.prototype.refresh = function () {
    var self = this;
    if (!this.db) return Promise.resolve(null);
    return this.db.rpc("auction_board").then(function (res) {
      if (res.error) throw res.error;
      self.board = res.data;
      self._emit();
      return res.data;
    });
  };

  /* Coalesce the burst of realtime events a single sale produces
     (players + teams + lots + state + events all fire at once). */
  AuctionClient.prototype._queueRefresh = function () {
    var self = this;
    if (this._pending) return;
    this._pending = true;
    setTimeout(function () {
      self._pending = false;
      self.refresh().catch(function (e) { console.error("refresh failed:", e); });
    }, 120);
  };

  AuctionClient.prototype.subscribe = function () {
    if (!this.db || this.channel) return this;
    var self = this;
    var ch = this.db.channel("auction-live");
    ["auction_state", "auction_lots", "auction_bids",
     "auction_players", "auction_teams", "auction_events"].forEach(function (table) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: table }, function () {
        self._queueRefresh();
      });
    });
    ch.subscribe();
    this.channel = ch;
    return this;
  };

  /* Realtime can drop out on flaky venue wifi — poll as a backstop. */
  AuctionClient.prototype.startPolling = function (ms) {
    var self = this;
    if (this._poll) clearInterval(this._poll);
    this._poll = setInterval(function () { self._queueRefresh(); }, ms || 6000);
    return this;
  };

  AuctionClient.prototype.stop = function () {
    if (this._poll) clearInterval(this._poll);
    if (this.channel && this.db) this.db.removeChannel(this.channel);
    this.channel = null;
    return this;
  };

  /* ---- write (every one of these is rule-checked server side) */
  AuctionClient.prototype.rpc = function (name, args) {
    var self = this;
    if (!this.db) return Promise.reject(new Error("Supabase is not configured"));
    return this.db.rpc(name, args || {}).then(function (res) {
      if (res.error) throw new Error(cleanError(res.error));
      /* Board-returning RPCs hand back fresh state — use it immediately
         instead of waiting for the realtime round trip. */
      if (res.data && res.data.teams && res.data.players) {
        self.board = res.data;
        self._emit();
      }
      return res.data;
    });
  };

  /* Postgres RAISE messages arrive wrapped; show just the sentence. */
  function cleanError(err) {
    var msg = (err && (err.message || err.details || err.hint)) || "Something went wrong";
    return String(msg).replace(/^.*?:\s*/, function (m) {
      return /error|exception/i.test(m) ? "" : m;
    }).trim();
  }

  /* ---- convenience wrappers --------------------------------- */
  var actions = {
    syncConfig:     function (c)              { return this.rpc("auction_sync_config", { p_config: c }); },
    setStatus:      function (s)              { return this.rpc("auction_set_status", { p_status: s }); },
    openLot:        function (playerId)       { return this.rpc("auction_open_lot", { p_player: playerId }); },
    /* Server-side draw — the browser never chooses who comes up next. */
    drawRandom:     function ()               { return this.rpc("auction_draw_random"); },
    openBySerial:   function (serial)         { return this.rpc("auction_open_by_serial", { p_serial: serial }); },
    /* Bidding happens in the room; the organiser records the result. */
    awardLot:       function (lot, team, price) {
      return this.rpc("auction_award_lot", { p_lot: lot, p_team: team, p_price: price });
    },
    sellLot:        function (lotId)          { return this.rpc("auction_sell_lot", { p_lot: lotId }); },
    unsoldLot:      function (lotId)          { return this.rpc("auction_unsold_lot", { p_lot: lotId }); },
    revertSale:     function (playerId)       { return this.rpc("auction_revert_sale", { p_player: playerId }); },
    resetAuction:   function (confirm)        { return this.rpc("auction_reset", { p_confirm: confirm }); },
    deletePlayer:   function (id)             { return this.rpc("auction_delete_player", { p_id: id }); },
    setAchievement: function (id, text)       { return this.rpc("auction_set_achievement", { p_id: id, p_text: text }); },
    setRetained:    function (p, t, role)     { return this.rpc("auction_set_retained", { p_player: p, p_team: t, p_role: role }); },
    setTeamPassword: function (t, pw)         { return this.rpc("auction_set_team_password", { p_team: t, p_password: pw }); },
    /* Pass no team to reissue every captain password in one go. The
       plaintext comes back once and is never stored. */
    generatePasswords: function (t)           { return this.rpc("auction_generate_team_passwords", { p_team: t || null }); },
    captainAccounts: function ()              { return this.rpc("auction_captain_accounts"); },
    /* Organiser-only: adds password_set_at and active_sessions, which the
       public roster deliberately omits. */
    captainAdminAccounts: function ()         { return this.rpc("auction_captain_admin_accounts"); },
    importRegistrations: function (cat)       { return this.rpc("auction_import_registrations", { p_cat: cat }); },
    captainLogin:   function (code, pw)       { return this.rpc("auction_captain_login", { p_code: code, p_password: pw }); },
    captainLogout:  function (token)          { return this.rpc("auction_captain_logout", { p_token: token }); },
    captainSession: function (token)          { return this.rpc("auction_captain_session", { p_token: token }); },
    updateTeam:     function (id, n, s, c, p) {
      return this.rpc("auction_update_team", { p_team: id, p_name: n, p_short: s, p_color: c, p_purse: p });
    },
    upsertPlayer:   function (id, name, cat, photo, reg, sort) {
      return this.rpc("auction_upsert_player", {
        p_id: id, p_name: name, p_cat: cat, p_photo: photo || null,
        p_registration: reg || null, p_sort: sort || 0 });
    },
    placeBid: function (lotId, teamId, amount, token, source) {
      return this.rpc("auction_place_bid", {
        p_lot: lotId, p_team: teamId, p_amount: amount,
        p_token: token || null, p_source: source || "captain" });
    }
  };
  Object.keys(actions).forEach(function (k) { AuctionClient.prototype[k] = actions[k]; });

  /* ---- board helpers used by every view --------------------- */
  AuctionClient.prototype.team = function (id) {
    if (!this.board) return null;
    for (var i = 0; i < this.board.teams.length; i++) {
      if (this.board.teams[i].id === id) return this.board.teams[i];
    }
    return null;
  };

  AuctionClient.prototype.player = function (id) {
    if (!this.board) return null;
    for (var i = 0; i < this.board.players.length; i++) {
      if (this.board.players[i].id === id) return this.board.players[i];
    }
    return null;
  };

  AuctionClient.prototype.category = function (code) {
    if (!this.board) return null;
    for (var i = 0; i < this.board.categories.length; i++) {
      if (this.board.categories[i].code === code) return this.board.categories[i];
    }
    return null;
  };

  AuctionClient.prototype.currentPlayer = function () {
    if (!this.board || !this.board.current_lot) return null;
    return this.player(this.board.current_lot.player_id);
  };

  global.AuctionClient = AuctionClient;
  global.createAuctionClient = function () { return new AuctionClient(); };
})(window);
