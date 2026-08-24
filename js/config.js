/* ============================================================
   CHAMPIONS LEAGUE SPORTS TOURNAMENT — SITE & BACKEND CONFIG
   ============================================================ */

window.CLP_CONFIG = {
  /* ---- Supabase Backend Credentials ---------------------------
     Set your Supabase Project URL & Anon Key here or via Vercel env vars.
     When empty or invalid, the app runs in interactive DEMO mode. */
  SUPABASE_URL: "https://your-supabase-project.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-public-key-here",

  /* Storage Bucket Name */
  STORAGE_BUCKET: "registrations",

  /* ---- Event Details ---------------------------------------- */
  EVENT: {
    name: "Champions League Sports Tournament",
    season: "Season 2026",
    tagline: "Unleash the Champion Within",
    dates: "October 15–18, 2026",
    venue: "Grand Champions Sports Arena",
    supportEmail: "support@championsleague.org"
  },

  /* ---- 8 Sports List for Skill Ratings (out of 10) ---------- */
  SPORTS: [
    { id: "pickleball", name: "Pickleball", icon: "fa-solid fa-table-tennis-paddle-ball" },
    { id: "poker", name: "Poker", icon: "fa-solid fa-spade" },
    { id: "cricket", name: "Cricket", icon: "fa-solid fa-baseball-bat-ball" },
    { id: "triathlon", name: "Triathlon", icon: "fa-solid fa-person-running" },
    { id: "archery_shooting", name: "Archery & Shooting", icon: "fa-solid fa-bullseye" },
    { id: "badminton", name: "Badminton", icon: "fa-solid fa-shuttlecock" },
    { id: "table_tennis", name: "Table Tennis", icon: "fa-solid fa-ping-pong-paddle-ball" },
    { id: "football", name: "Football / Multi-Sport", icon: "fa-solid fa-football" }
  ],

  /* Jersey Sizes */
  JERSEY_SIZES: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],

  /* Maximum photo upload size in MB */
  MAX_UPLOAD_MB: 8
};
