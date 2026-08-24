/* ============================================================
   1727 CHAMPION'S LEAGUE — SITE & BACKEND CONFIG
   ============================================================ */

window.CLP_CONFIG = {
  /* ---- Supabase Backend Credentials --------------------------- */
  SUPABASE_URL: "https://hckejkokkzbzrvbbrscz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhja2Vqa29ra3pienJ2YmJyc2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1ODI5MjgsImV4cCI6MjEwMzE1ODkyOH0.8OzH2mLs0DVZ66CNAmQtskE6towBAvAfuorZVpOK-RQ",

  /* Storage Bucket Name */
  STORAGE_BUCKET: "registrations",

  /* ---- Event Details ---------------------------------------- */
  EVENT: {
    name: "1727 Champion's League",
    tagline: "Unleash the Champion Within",
    dates: "October 15–18, 2026",
    venue: "Grand Champions Sports Arena",
    supportEmail: "support@championsleague.org"
  },

  /* ---- 7 Official Sports List for Skill Ratings (out of 10) --- */
  SPORTS: [
    { id: "pickleball", name: "Pickleball", icon: "fa-solid fa-table-tennis-paddle-ball" },
    { id: "poker", name: "Poker", icon: "fa-solid fa-spade" },
    { id: "cricket", name: "Cricket", icon: "fa-solid fa-baseball-bat-ball" },
    { id: "triathlon", name: "Triathlon", icon: "fa-solid fa-person-running" },
    { id: "archery_shooting", name: "Archery & Shooting", icon: "fa-solid fa-bullseye" },
    { id: "badminton", name: "Badminton", icon: "fa-solid fa-feather-pointed" },
    { id: "table_tennis", name: "Table Tennis", icon: "fa-solid fa-table-tennis-paddle-ball" }
  ],

  /* Jersey Sizes */
  JERSEY_SIZES: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],

  /* Maximum photo upload size in MB */
  MAX_UPLOAD_MB: 8
};
