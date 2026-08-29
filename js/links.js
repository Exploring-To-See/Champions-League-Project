/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — DOMAIN MAP

   One domain, one view. Nothing here renders navigation any more:
   each deployment serves exactly one thing, and vercel.json redirects
   any other path on that host back to the view it owns, so a captain
   cannot land on the organiser console by editing the address bar.

   What is left is the lookup, still needed in two places that have to
   point ACROSS domains on purpose:
     - the organiser console tells captains where to sign in
     - the captain console links back to the public board
   ============================================================ */

window.CLP_LINKS = {
  REGISTRATION: "https://1727championsleague.vercel.app",   /* the entry form   */
  PUBLIC:       "https://1727championstats.vercel.app",     /* everyone watching */
  CAPTAIN:      "https://1727championsauction.vercel.app",  /* team captains     */
  ADMIN:        "https://championsadmin.vercel.app"         /* organiser         */
};

(function (global) {
  "use strict";

  var VIEWS = {
    REGISTRATION: { path: "/",        label: "Register" },
    PUBLIC:       { path: "/auction", label: "Live Auction" },
    CAPTAIN:      { path: "/captain", label: "Captain" },
    ADMIN:        { path: "/admin",   label: "Organiser" }
  };

  /* Absolute URL for a view. Falls back to a same-origin path if the
     domain is ever blanked out, so the site still works undeployed. */
  function urlFor(key) {
    var base = (global.CLP_LINKS && global.CLP_LINKS[key]) || "";
    var view = VIEWS[key];
    if (!view) return "#";
    return base ? base.replace(/\/+$/, "") + (view.path === "/" ? "/" : view.path) : view.path;
  }

  global.CLP_NAV = { urlFor: urlFor, views: VIEWS };
})(window);
