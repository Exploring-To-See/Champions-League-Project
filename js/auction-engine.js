/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — AUCTION RULES ENGINE
   ------------------------------------------------------------
   Pure functions. No DOM, no network. Mirrors exactly what the
   Supabase SQL functions enforce server side, so the console can
   grey out an illegal bid before the server ever rejects it.

   Team shape   : { id, name, purseTotal, purseSpent, owned:{CODE:n} }
   Player shape : { id, name, category, status:'available'|'in_lot'|'sold',
                    teamId, soldPrice }
   ============================================================ */

(function (global) {
  "use strict";

  /* ---------- Money helpers ---------------------------------- */

  /* Indian digit grouping: last 3, then pairs.  7000000 -> 70,00,000 */
  function groupINR(n) {
    var s = String(Math.abs(Math.round(n)));
    if (s.length <= 3) return s;
    var last3 = s.slice(-3);
    var rest = s.slice(0, -3);
    return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }

  function formatINR(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return (n < 0 ? "-" : "") + "₹" + groupINR(n);
  }

  /* Compact form for tight cards: 70,00,000 -> 70.00 L */
  function formatShort(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    var abs = Math.abs(n);
    var sign = n < 0 ? "-" : "";
    if (abs >= 10000000) return sign + "₹" + (abs / 10000000).toFixed(2) + " Cr";
    if (abs >= 100000) return sign + "₹" + (abs / 100000).toFixed(2) + " L";
    if (abs >= 1000) return sign + "₹" + (abs / 1000).toFixed(0) + "K";
    return sign + "₹" + abs;
  }

  /* ---------- Config derivation ------------------------------ */

  /*
    Everything below is COMPUTED from config, never hardcoded:
      minReserveWallet - what a team with an empty squad must hold back
      slack(X)         - pool(X) - teams * minimum(X)
      maxSquad         - minSquad + total slack (pool-bounded ceiling)
  */
  function derive(config) {
    var byCode = {};
    var auctionable = [];
    var minReserveWallet = 0;
    var slack = {};
    var totalSlack = 0;
    var totalPool = 0;

    config.categories.forEach(function (cat) {
      byCode[cat.code] = cat;
      totalPool += cat.pool;

      /* Retained players are pre-assigned and cost nothing, so they
         never contribute to the wallet a team has to hold back. */
      if (!cat.retained) {
        auctionable.push(cat);
        minReserveWallet += cat.minPerTeam * cat.base;
      }

      var s = cat.pool - config.teams * cat.minPerTeam;
      slack[cat.code] = s;
      totalSlack += Math.max(0, s);
    });

    return {
      config: config,
      byCode: byCode,
      categories: config.categories,
      auctionable: auctionable,
      minReserveWallet: minReserveWallet,
      slack: slack,
      totalSlack: totalSlack,
      totalPool: totalPool,
      minSquad: config.minSquad,
      maxSquad: config.minSquad + totalSlack,
      minSquadFromCategories: config.categories.reduce(function (a, c) {
        return a + c.minPerTeam;
      }, 0)
    };
  }

  /* ---------- Rule 5: increments ----------------------------- */

  function stepFor(amount, config) {
    var bands = config.increments;
    for (var i = 0; i < bands.length; i++) {
      if (bands[i].upTo === null || bands[i].upTo === undefined) return bands[i].step;
      if (amount < bands[i].upTo) return bands[i].step;
    }
    return bands[bands.length - 1].step;
  }

  /* Opening bid for a lot is the BASE price, not base + step. */
  function openingBid(player, d) {
    return d.byCode[player.category].base;
  }

  function nextBid(currentBid, player, d) {
    if (currentBid === null || currentBid === undefined) return openingBid(player, d);
    return currentBid + stepFor(currentBid, d.config);
  }

  /* ---------- Squad state ------------------------------------ */

  function owned(team, code) {
    return (team.owned && team.owned[code]) || 0;
  }

  function squadSize(team, d) {
    return d.categories.reduce(function (a, c) { return a + owned(team, c.code); }, 0);
  }

  function purseLeft(team) {
    return team.purseTotal - team.purseSpent;
  }

  /* Rule 1: unmet(T, X) = max(0, minimum(X) - owned(T, X)) */
  function unmet(team, code, d) {
    var cat = d.byCode[code];
    if (!cat) return 0;
    return Math.max(0, cat.minPerTeam - owned(team, code));
  }

  function totalUnmet(team, d) {
    return d.categories.reduce(function (a, c) { return a + unmet(team, c.code, d); }, 0);
  }

  /* Rule 1: reserve(T, P) evaluated AS IF P had already been acquired.
     acquiringCode = null gives the plain, nothing-acquired reserve. */
  function reserve(team, acquiringCode, d) {
    var total = 0;
    d.categories.forEach(function (cat) {
      if (cat.retained) return;              /* retained cost nothing */
      var need = unmet(team, cat.code, d);
      if (cat.code === acquiringCode && need > 0) need -= 1;
      total += need * cat.base;
    });
    return total;
  }

  /* Rule 1: maxBid(T, P) = purse(T) - reserve(T, P) */
  function maxBid(team, player, d) {
    return purseLeft(team) - reserve(team, player.category, d);
  }

  /* ---------- Pool state ------------------------------------- */

  /* remaining(X): every player in X not yet sold — the lot on the
     block is still "remaining", which is why rule 3 subtracts one. */
  function remaining(code, players) {
    var n = 0;
    for (var i = 0; i < players.length; i++) {
      if (players[i].category === code && players[i].status !== "sold") n++;
    }
    return n;
  }

  function otherTeamsUnmet(teamId, code, teams, d) {
    var total = 0;
    teams.forEach(function (t) {
      if (t.id === teamId) return;
      total += unmet(t, code, d);
    });
    return total;
  }

  /* Rule 3: feasibility guard.
     A surplus buy must never make another team's minimum impossible:
        remaining(X) - 1 >= sum over OTHER teams of unmet(T', X)
     Derived generically from the counts — no per-category special cases. */
  function surplusFeasible(teamId, code, teams, players, d) {
    return (remaining(code, players) - 1) >= otherTeamsUnmet(teamId, code, teams, d);
  }

  /* The most players T could still end up with in X once every other
     team's minimum is honoured. Basis for rule 4. */
  function claimable(teamId, code, teams, players, d) {
    return remaining(code, players) - otherTeamsUnmet(teamId, code, teams, d);
  }

  /* Rule 4: T's count in X is locked — it can get no more and no
     fewer than its outstanding minimum. */
  function countsLocked(team, code, teams, players, d) {
    var need = unmet(team, code, d);
    if (need <= 0) return false;
    return claimable(team.id, code, teams, players, d) <= need;
  }

  /* ---------- Rule 2: eligibility ---------------------------- */

  /*
    Returns { eligible, reason, maxBid, needsCategory, compulsory }.
    `reason` is the one-liner shown under a greyed-out bid button.
  */
  function eligibility(team, player, teams, players, d) {
    var code = player.category;
    var cat = d.byCode[code];
    var base = cat.base;
    var need = unmet(team, code, d);
    var mb = maxBid(team, player, d);

    var out = {
      teamId: team.id,
      eligible: false,
      reason: "",
      maxBid: mb,
      needsCategory: need > 0,
      compulsory: false,
      base: base
    };

    if (player.teamId && player.status === "sold") {
      out.reason = "Player already sold";
      return out;
    }

    /* Can't outbid your own standing bid isn't a rule — but you must
       at least be able to afford the base price. */
    if (mb < base) {
      out.reason = "Max bid " + formatINR(Math.max(0, mb)) + " — below base";
      return out;
    }

    if (need > 0) {
      /* Rule 2: still needs this category, so always eligible. */
      out.eligible = true;
      out.reason = "Needs " + need + " more " + cat.short + " — max " + formatINR(mb);
      return out;
    }

    /* Minimum already met: surplus buy, gated by rule 3. */
    if (!surplusFeasible(team.id, code, teams, players, d)) {
      out.reason = "Minimum met, category full for surplus";
      return out;
    }

    out.eligible = true;
    out.reason = "Surplus buy allowed — max " + formatINR(mb);
    return out;
  }

  /* ---------- Rule 4: compulsory fill ------------------------ */

  /*
    Scans every team x category after each sale. Two distinct outputs:

      forced[]  - exactly ONE team can legally take the players left in
                  X and its count is locked, so they are its at base and
                  nobody may compete. This is the deadlock case that
                  breaks auctions; it is surfaced prominently.

      locked[]  - a team's COUNT in X is fixed, but two or more teams are
                  still eligible, so bidding proceeds normally. Advisory.
  */
  function compulsoryReport(teams, players, d) {
    var forced = [];
    var locked = [];

    d.categories.forEach(function (cat) {
      if (cat.retained) return;
      var rem = remaining(cat.code, players);
      if (rem <= 0) return;

      var eligibleTeams = teams.filter(function (t) {
        var probe = { id: "probe", name: "", category: cat.code, status: "available" };
        return eligibility(t, probe, teams, players, d).eligible;
      });

      teams.forEach(function (t) {
        if (!countsLocked(t, cat.code, teams, players, d)) return;
        var need = unmet(t, cat.code, d);
        var entry = {
          teamId: t.id,
          teamName: t.name,
          category: cat.code,
          categoryLabel: cat.label,
          count: need,
          remaining: rem,
          base: cat.base
        };
        if (eligibleTeams.length === 1 && eligibleTeams[0].id === t.id) {
          entry.message = rem === 1 && need === 1
            ? "Last " + cat.label + " — compulsory fill for " + t.name + " at " + formatINR(cat.base)
            : t.name + " must take all " + need + " remaining " + cat.label + " at " + formatINR(cat.base);
          forced.push(entry);
        } else {
          entry.message = t.name + " is locked into exactly " + need + " more " +
            cat.label + " (" + rem + " left in pool)";
          locked.push(entry);
        }
      });
    });

    return { forced: forced, locked: locked };
  }

  /* Is this specific player a forced/compulsory lot, and for whom? */
  function forcedFor(player, teams, players, d) {
    var report = compulsoryReport(teams, players, d);
    for (var i = 0; i < report.forced.length; i++) {
      if (report.forced[i].category === player.category) return report.forced[i];
    }
    return null;
  }

  /* ---------- Lot context: what all three views render -------- */

  /*
    Full picture for one player on the block: per-team eligibility,
    live max bids, and whether the lot is a compulsory fill (in which
    case the price is pinned to base and only one team may bid).
  */
  function lotContext(player, teams, players, d, currentBid) {
    var forced = forcedFor(player, teams, players, d);
    var base = d.byCode[player.category].base;
    var next = nextBid(currentBid === undefined ? null : currentBid, player, d);

    var rows = teams.map(function (t) {
      var e = eligibility(t, player, teams, players, d);
      if (forced) {
        if (forced.teamId === t.id) {
          e.eligible = true;
          e.compulsory = true;
          e.maxBid = base;
          e.reason = "Compulsory fill — must take at " + formatINR(base);
        } else {
          e.eligible = false;
          e.compulsory = false;
          e.maxBid = 0;
          e.reason = "Compulsory fill for " + forced.teamName + " — no competition";
        }
      }
      e.teamName = t.name;
      e.canMeetNextBid = e.eligible && next <= e.maxBid;
      if (e.eligible && !e.canMeetNextBid) {
        e.reason = "Max bid " + formatINR(e.maxBid) + " — cannot meet " + formatINR(next);
      }
      return e;
    });

    return {
      player: player,
      base: base,
      currentBid: currentBid === undefined ? null : currentBid,
      nextBid: next,
      step: stepFor(currentBid === undefined || currentBid === null ? base : currentBid, d.config),
      compulsory: forced,
      teams: rows
    };
  }

  /* ---------- Rule 6/7: end-of-auction guard ------------------ */

  /*
    Admin may not close the auction while any player is still unsold
    AND any team has an unmet minimum. Names both, so the organiser
    knows exactly what is blocking.
  */
  function endAuctionCheck(teams, players, d) {
    var unsoldPlayers = players.filter(function (p) { return p.status !== "sold"; });
    var teamsShort = teams.filter(function (t) { return totalUnmet(t, d) > 0; });

    var blockers = [];
    if (unsoldPlayers.length > 0 && teamsShort.length > 0) {
      teamsShort.forEach(function (t) {
        d.categories.forEach(function (cat) {
          var need = unmet(t, cat.code, d);
          if (need <= 0) return;
          var open = unsoldPlayers.filter(function (p) { return p.category === cat.code; });
          blockers.push({
            teamId: t.id,
            teamName: t.name,
            category: cat.code,
            categoryLabel: cat.label,
            short: need,
            players: open.map(function (p) { return p.name; })
          });
        });
      });
    }

    return {
      canEnd: blockers.length === 0,
      unsoldCount: unsoldPlayers.length,
      unsoldNames: unsoldPlayers.map(function (p) { return p.name; }),
      blockers: blockers
    };
  }

  /*
    Players nobody can legally buy any more. The rules guarantee minimums
    are always fillable, but not full sell-through: if every team spends
    down to its reserve, the slack players strand here.
  */
  function strandedReport(teams, players, d) {
    var out = [];
    d.categories.forEach(function (cat) {
      if (cat.retained) return;
      var rem = remaining(cat.code, players);
      if (rem <= 0) return;
      var probe = { id: "probe", name: "", category: cat.code, status: "available" };
      var anyEligible = teams.some(function (t) {
        return eligibility(t, probe, teams, players, d).eligible;
      });
      if (anyEligible) return;
      out.push({
        category: cat.code,
        categoryLabel: cat.label,
        count: rem,
        base: cat.base,
        players: players.filter(function (p) {
          return p.category === cat.code && p.status !== "sold";
        }).map(function (p) { return p.name; }),
        message: rem + " " + cat.label + " player(s) cannot be sold — no team has " +
                 "purse above the base price of " + formatINR(cat.base)
      });
    });
    return out;
  }

  /* Rule 7: a team drops out when its minimums are met and nothing
     legal is left to chase. */
  function isSquadComplete(team, teams, players, d) {
    if (totalUnmet(team, d) > 0) return false;
    for (var i = 0; i < d.categories.length; i++) {
      var cat = d.categories[i];
      if (cat.retained) continue;
      if (remaining(cat.code, players) <= 0) continue;
      var probe = { id: "probe", name: "", category: cat.code, status: "available" };
      if (eligibility(team, probe, teams, players, d).eligible) return false;
    }
    return true;
  }

  /* ---------- Bid validation (mirrors the SQL) ---------------- */

  function validateBid(team, player, teams, players, d, currentBid, amount, source) {
    var ctx = lotContext(player, teams, players, d, currentBid);
    var row = null;
    for (var i = 0; i < ctx.teams.length; i++) {
      if (ctx.teams[i].teamId === team.id) { row = ctx.teams[i]; break; }
    }
    if (!row) return { ok: false, reason: "Team not in this auction" };
    if (!row.eligible) return { ok: false, reason: row.reason };

    if (amount > row.maxBid) {
      return { ok: false, reason: "Exceeds max bid of " + formatINR(row.maxBid) };
    }
    if (ctx.compulsory && amount !== ctx.base) {
      return { ok: false, reason: "Compulsory fill must be taken at base " + formatINR(ctx.base) };
    }
    if (currentBid === null || currentBid === undefined) {
      if (amount < ctx.base) return { ok: false, reason: "Opening bid is the base price " + formatINR(ctx.base) };
    } else if (source === "admin") {
      if (amount <= currentBid) return { ok: false, reason: "Must exceed the current bid" };
    } else if (amount !== ctx.nextBid) {
      return { ok: false, reason: "Next valid bid is " + formatINR(ctx.nextBid) };
    }
    return { ok: true, reason: "" };
  }

  global.AuctionEngine = {
    formatINR: formatINR,
    formatShort: formatShort,
    groupINR: groupINR,
    derive: derive,
    stepFor: stepFor,
    openingBid: openingBid,
    nextBid: nextBid,
    owned: owned,
    squadSize: squadSize,
    purseLeft: purseLeft,
    unmet: unmet,
    totalUnmet: totalUnmet,
    reserve: reserve,
    maxBid: maxBid,
    remaining: remaining,
    otherTeamsUnmet: otherTeamsUnmet,
    surplusFeasible: surplusFeasible,
    claimable: claimable,
    countsLocked: countsLocked,
    eligibility: eligibility,
    compulsoryReport: compulsoryReport,
    forcedFor: forcedFor,
    lotContext: lotContext,
    endAuctionCheck: endAuctionCheck,
    strandedReport: strandedReport,
    isSquadComplete: isSquadComplete,
    validateBid: validateBid
  };
})(typeof window !== "undefined" ? window : globalThis);
