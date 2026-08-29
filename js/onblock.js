/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — "ON THE BLOCK" PLAYER CARD
   Shared by the Organiser console and the public live view so the
   two can never drift apart, and so the console's full screen mode
   shows exactly what the room sees.

   Everything on it comes from the player's own registration: photo,
   age, debut-or-veteran, and the two sports they rated themselves
   highest in. Base price comes from their category.
   ============================================================ */

(function (global) {
  "use strict";

  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* Indian digit grouping, without the symbol — the card carries a rupee
     token beside the figure, so repeating it in the value reads twice. */
  function money(n) {
    if (n === null || n === undefined) return "—";
    var s = String(Math.abs(Math.round(n))), out;
    if (s.length <= 3) out = s;
    else {
      var last3 = s.slice(-3), rest = s.slice(0, -3), parts = [];
      while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
      out = (rest ? rest + "," : "") + (parts.length ? parts.join(",") + "," : "") + last3;
    }
    return out;
  }

  /* The registrations tab shows these as DEBUT / VETERAN; the stored value
     is the longer "Previous Participant". Same word everywhere. */
  function historyLabel(v) {
    if (!v) return "";
    return v === "Previous Participant" ? "Veteran" : esc(v);
  }

  function box(value, extraClass) {
    var empty = value === null || value === undefined || value === "";
    return '<div class="otb-box' + (empty ? " empty" : "") + (extraClass ? " " + extraClass : "") +
           '">' + (empty ? "—" : value) + "</div>";
  }

  /* Pass label = null when the frame holds its own labelled columns,
     as AGE | HISTORY does. */
  function field(label, inner, opts) {
    opts = opts || {};
    return '<div class="otb-field' + (opts.cyan ? " cyan" : "") +
           (opts.className ? " " + opts.className : "") + '">' +
           '<div class="otb-body">' +
             (label ? '<span class="otb-label">' + esc(label) + "</span>" : "") + inner +
           "</div></div>";
  }

  /* Branding strip along the bottom of the card: the tournament logo first,
     then the three organising bodies. The organiser opts in, because this is
     the card that goes on the big screen. */
  function footerStrip() {
    return '<div class="otb-footer">' +
      '<img class="otb-footer-main" src="/assets/champions-logo.png?v=3" alt="1727 Champions League">' +
      '<span class="otb-footer-rule"></span>' +
      '<img src="/assets/partner-csrt17.png" alt="Calcutta South Round Table 17">' +
      '<img src="/assets/partner-csrt-cclc.png" alt="CSRT 17 and CCLC 27">' +
      '<img src="/assets/partner-cclc27.png" alt="Calcutta Cosmopolitan Ladies Circle 27">' +
    "</div>";
  }

  /*
    player : a row from board.players (carries age, history, top_sports,
             achievement, photo_url, sort_order)
    cat    : the matching row from board.categories
    base   : base price to show — pass lot_context.base when a lot is open
  */
  function card(player, cat, base, opts) {
    if (!player) return "";
    opts = opts || {};

    var photo = player.photo_url
      ? '<img src="' + esc(player.photo_url) + '" alt="' + esc(player.name) + '">'
      : '<div class="otb-photo-empty"><i class="fa-solid fa-user"></i></div>';

    var sports = player.top_sports || [];
    var sportRows = "";
    for (var i = 0; i < 2; i++) {
      var s = sports[i];
      sportRows +=
        '<div class="otb-sport"><div class="otb-rank">' + (i + 1) + "</div>" +
        box(s ? esc(s.sport) : "") +
        "</div>";
    }

    var price = base === null || base === undefined
      ? (cat ? cat.base_price : null)
      : base;

    return '<div class="otb">' +
      '<div class="otb-photo"><div class="otb-photo-inner">' + photo + "</div></div>" +
      '<div class="otb-fields">' +

        field("Name", box('<span>' + esc(player.name) + "</span>"), { className: "otb-name" }) +

        field(null, '<div class="otb-split">' +
            '<div><span class="otb-label">Age</span>' +
              box(player.age ? esc(player.age) : "") + "</div>" +
            '<div class="otb-rule"></div>' +
            '<div><span class="otb-label">History</span>' +
              box(historyLabel(player.history)) + "</div>" +
          "</div>", { cyan: true }) +

        field("Base Price", '<div class="otb-price">' + box(money(price)) +
            '<div class="otb-rupee">₹</div></div>',
          { className: "price-mobile-cyan" }) +

        field("Top 2 Sports", sportRows, { cyan: true }) +

        field("Previous Tournament Achievement",
          box(player.achievement ? esc(player.achievement) : ""),
          { className: player.achievement ? "has-achievement" : "" }) +

      "</div>" + (opts.logos ? footerStrip() : "") + "</div>";
  }

  /* Font Awesome stand-ins for the sport glyphs in the captain design.
     Keyed by the label auction_player_ratings returns. */
  var SPORT_ICON = {
    "Pickleball":         "fa-table-tennis-paddle-ball",
    "Poker":              "fa-spade",
    "Cricket":            "fa-baseball-bat-ball",
    "Triathlon":          "fa-person-running",
    "Archery & Shooting": "fa-bullseye",
    "Badminton":          "fa-feather-pointed",
    "Table Tennis":       "fa-table-tennis-paddle-ball"
  };

  /*
    The captain's card. Same player, different question: a captain is
    deciding what to pay, so they get the category, and every sport score
    rather than only the best two.
  */
  function captainCard(player, cat, base, opts) {
    if (!player) return "";
    opts = opts || {};

    var photo = player.photo_url
      ? '<img src="' + esc(player.photo_url) + '" alt="' + esc(player.name) + '">'
      : '<div class="otb-photo-empty"><i class="fa-solid fa-user"></i></div>';

    var ratings = player.ratings || [];
    var tiles = ratings.map(function (r) {
      var val = Number(r.rating);
      return '<div class="otb-tile' + (val > 0 ? "" : " zero") + '">' +
        '<i class="fa-solid ' + (SPORT_ICON[r.sport] || "fa-medal") + '"></i>' +
        '<div class="otb-tile-name">' + esc(r.sport) + "</div>" +
        '<div class="otb-tile-score"><b>' + val.toFixed(1) + "</b><span>/10</span></div>" +
      "</div>";
    }).join("");

    var price = base === null || base === undefined ? (cat ? cat.base_price : null) : base;

    return '<div class="otb otb-captain">' +
      '<div class="otb-photo"><div class="otb-photo-inner">' + photo + "</div></div>" +
      '<div class="otb-fields">' +

        field("Name", box("<span>" + esc(player.name) + "</span>"), { className: "otb-name" }) +

        field(null, '<div class="otb-split">' +
            '<div><span class="otb-label">Age</span>' +
              box(player.age ? esc(player.age) : "") + "</div>" +
            '<div class="otb-rule"></div>' +
            '<div><span class="otb-label">History</span>' +
              box(historyLabel(player.history)) + "</div>" +
          "</div>", { cyan: true }) +

        /* category and price side by side, as the captain design has them */
        '<div class="otb-pair">' +
          field("Category", box(esc(cat ? cat.label : player.category)), { cyan: true }) +
          field("Base Price", '<div class="otb-price">' + box(money(price)) +
            '<div class="otb-rupee">₹</div></div>') +
        "</div>" +

        field("Last Tournament Achievement",
          box(player.achievement ? esc(player.achievement) : ""),
          { cyan: !player.achievement,
            className: player.achievement ? "has-achievement" : "" }) +

        (tiles ? '<div class="otb-tiles">' + tiles + "</div>" : "") +

      "</div>" + (opts.logos ? footerStrip() : "") + "</div>";
  }

  global.OnBlockCard = { render: card, renderCaptain: captainCard, money: money };
})(window);
