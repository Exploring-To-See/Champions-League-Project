/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — SITE LINK MAP & SHARED NAV
   ------------------------------------------------------------
   THE ONE PLACE to point the four public views at their own
   Vercel domains. Every page builds its navigation from this,
   so adding a domain is a single-line edit here.

   Leave a value as "" and that link stays a relative path on
   whatever domain the visitor is already on — so the site works
   before any custom domains exist, and keeps working after.
   ============================================================ */

window.CLP_LINKS = {
  /* --- Paste each Vercel URL here (no trailing slash) --------
     e.g. REGISTRATION: "https://1727championsleague.vercel.app"
     ----------------------------------------------------------- */
  REGISTRATION: "",   /* Player registration form            -> / */
  PUBLIC:       "",   /* General public live auction view    -> /auction */
  CAPTAIN:      "",   /* Team captain bidding console        -> /captain */
  ADMIN:        ""    /* Organiser console + auction control -> /admin */
};

(function (global) {
  "use strict";

  /* Fallback paths used whenever a domain above is left blank. */
  var VIEWS = {
    REGISTRATION: { path: "/",         label: "Register",     icon: "fa-user-plus" },
    PUBLIC:       { path: "/auction",  label: "Live Auction", icon: "fa-tower-broadcast" },
    CAPTAIN:      { path: "/captain",  label: "Captain",      icon: "fa-shield-halved" },
    ADMIN:        { path: "/admin",    label: "Organiser",    icon: "fa-user-gear" }
  };

  function urlFor(key) {
    var base = (global.CLP_LINKS && global.CLP_LINKS[key]) || "";
    var view = VIEWS[key];
    if (!view) return "#";
    return base ? base.replace(/\/+$/, "") + (view.path === "/" ? "/" : view.path) : view.path;
  }

  /*
    Renders the cross-site nav into <nav class="clp-nav" data-current="KEY">.
    `current` highlights the active view; ADMIN is only shown when the page
    asks for it, so the organiser link is not advertised to the public.
  */
  function renderNav(current, opts) {
    opts = opts || {};
    var host = document.querySelector(".clp-nav");
    if (!host) return;

    var keys = ["REGISTRATION", "PUBLIC", "CAPTAIN"];
    if (opts.includeAdmin) keys.push("ADMIN");

    host.innerHTML =
      '<div class="clp-nav-inner">' +
      keys.map(function (k) {
        var v = VIEWS[k];
        var active = k === current;
        return '<a class="clp-nav-link' + (active ? " active" : "") + '" href="' + urlFor(k) + '"' +
               (active ? ' aria-current="page"' : "") + '>' +
               '<i class="fa-solid ' + v.icon + '"></i><span>' + v.label + "</span></a>";
      }).join("") +
      "</div>";
  }

  /* Footer link row — mirrors the nav plus the organiser console. */
  function renderFooter(current) {
    var host = document.querySelector("#clp-footer-links");
    if (!host) return;
    host.innerHTML = ["REGISTRATION", "PUBLIC", "CAPTAIN", "ADMIN"].map(function (k) {
      var v = VIEWS[k];
      if (k === current) return '<span style="color:var(--primary-cyan); font-size:0.82rem; padding:0.3rem 0.7rem;">' + v.label + "</span>";
      return '<a href="' + urlFor(k) + '">' + v.label + "</a>";
    }).join("");
  }

  /*
    Every page calls this once. `data-view` on <body> names the current
    view, so a page never has to repeat its own identity in script.
  */
  function boot() {
    var view = (document.body && document.body.getAttribute("data-view")) || "";
    renderNav(view, { includeAdmin: view === "ADMIN" });
    renderFooter(view);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.CLP_NAV = { urlFor: urlFor, views: VIEWS, render: renderNav, renderFooter: renderFooter };
})(window);
