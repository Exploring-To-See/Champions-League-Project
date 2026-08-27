/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — AUCTION CONFIG
   SINGLE SOURCE OF TRUTH.
   Nothing about squad maths is hardcoded anywhere else.
   Every derived number (reserve wallet, slack, max squad,
   increments) is computed from this file by js/auction-engine.js
   and mirrored into Supabase via the "Sync Config" admin action.
   ============================================================ */

window.CLP_AUCTION_CONFIG = {
  /* ---- Tournament identity ---------------------------------- */
  tournament: "1727 Champion's League 2.0",

  /* ---- Global squad + money rules --------------------------- */
  teams: 4,
  minSquad: 15,
  purse: 10000000,          /* 1,00,00,000  = Rs. 1 crore per team */
  retainedCostToTeam: 0,    /* Captain + Vice Captain cost nothing */

  /* ---- Full pool: 64 players, ONE single auction round -------
     pool       = how many players exist in this category
     base       = opening / reserve price for the category
     minPerTeam = minimum every team must finish with
     retained   = true means pre-assigned, never auctioned
     ----------------------------------------------------------- */
  categories: [
    {
      code: "CVC",
      label: "Captain & Vice Captain",
      short: "CVC",
      type: "retained",
      pool: 8,
      base: 0,
      minPerTeam: 2,
      retained: true,
      color: "#f5c518"
    },
    {
      code: "CIRCULAR_A",
      label: "Circular A",
      short: "CIR-A",
      type: "circular",
      pool: 8,
      base: 200000,
      minPerTeam: 2,
      retained: false,
      color: "#00e5ff"
    },
    {
      code: "CIRCULAR_B",
      label: "Circular B",
      short: "CIR-B",
      type: "circular",
      pool: 14,
      base: 100000,
      minPerTeam: 3,
      retained: false,
      color: "#38bdf8"
    },
    {
      code: "TABLER_A",
      label: "Tabler A",
      short: "TAB-A",
      type: "tabler",
      pool: 12,
      base: 500000,
      minPerTeam: 3,
      retained: false,
      color: "#ff3b5c"
    },
    {
      code: "TABLER_B",
      label: "Tabler B",
      short: "TAB-B",
      type: "tabler",
      pool: 12,
      base: 300000,
      minPerTeam: 3,
      retained: false,
      color: "#fb7185"
    },
    {
      code: "TABLER_C",
      label: "Tabler C",
      short: "TAB-C",
      type: "tabler",
      pool: 10,
      base: 200000,
      minPerTeam: 2,
      retained: false,
      color: "#a855f7"
    }
  ],

  /* ---- Bid increment bands ----------------------------------
     Evaluated against the CURRENT bid. First band whose `upTo`
     is greater than the current bid wins. `upTo: null` = open top.
       below  10,00,000 -> 50,000 steps
       10,00,000 and up -> 1,00,000 steps
     ----------------------------------------------------------- */
  increments: [
    { upTo: 1000000, step: 50000 },
    { upTo: null,    step: 100000 }
  ],

  /* ---- Default team slots (names/colours editable in admin) -- */
  teamSlots: [
    { code: "T1", name: "Team Alpha",   short: "ALP", color: "#00e5ff" },
    { code: "T2", name: "Team Bravo",   short: "BRV", color: "#ff3b5c" },
    { code: "T3", name: "Team Charlie", short: "CHR", color: "#f5c518" },
    { code: "T4", name: "Team Delta",   short: "DLT", color: "#a855f7" }
  ]
};
