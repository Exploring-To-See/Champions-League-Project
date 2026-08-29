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

  /* Indian grouping, matching the server's auction_money(). */
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

  /*
    player : a row from board.players (carries age, history, top_sports,
             achievement, photo_url, sort_order)
    cat    : the matching row from board.categories
    base   : base price to show — pass lot_context.base when a lot is open
  */
  function card(player, cat, base) {
    if (!player) return "";

    var photo = player.photo_url
      ? '<img src="' + esc(player.photo_url) + '" alt="' + esc(player.name) + '">'
      : '<div class="otb-photo-empty"><i class="fa-solid fa-user"></i></div>';

    var sports = player.top_sports || [];
    var sportRows = "";
    for (var i = 0; i < 2; i++) {
      var s = sports[i];
      sportRows +=
        '<div class="otb-sport"><div class="otb-rank">' + (i + 1) + "</div>" +
        box(s ? esc(s.sport) +
                '<span class="otb-sport-rating">' + Number(s.rating).toFixed(1) + "</span>"
              : "") +
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
              box(player.history ? esc(player.history) : "") + "</div>" +
          "</div>", { cyan: true }) +

        field("Base Price", '<div class="otb-price">' + box(money(price)) +
            '<div class="otb-rupee">₹</div></div>',
          { className: "price-mobile-cyan" }) +

        field("Top 2 Sports", sportRows, { cyan: true }) +

        field("Previous Tournament Achievement",
          box(player.achievement ? esc(player.achievement) : ""),
          { className: player.achievement ? "has-achievement" : "" }) +

      "</div></div>";
  }

  global.OnBlockCard = { render: card, money: money };
})(window);
