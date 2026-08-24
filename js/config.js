/* ============================================================
   1727 CHAMPION'S LEAGUE 2.0 — SITE & BACKEND CONFIG
   ============================================================ */

window.CLP_CONFIG = {
  /* ---- Supabase Backend Credentials --------------------------- */
  SUPABASE_URL: "https://hckejkokkzbzrvbbrscz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhja2Vqa29ra3pienJ2YmJyc2N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1ODI5MjgsImV4cCI6MjEwMzE1ODkyOH0.8OzH2mLs0DVZ66CNAmQtskE6towBAvAfuorZVpOK-RQ",

  /* Storage Bucket Name */
  STORAGE_BUCKET: "registrations",

  /* ---- Event Details ---------------------------------------- */
  EVENT: {
    name: "1727 Champion's League 2.0",
    tagline: "Unleash the Champion Within",
    dates: "October 15–18, 2026",
    venue: "Grand Champions Sports Arena",
    supportEmail: "support@championsleague.org"
  },

  /* ---- 7 Official Sports List for Skill Ratings (out of 10) --- */
  SPORTS: [
    { id: "pickleball", name: "Pickleball", emoji: "🏓" },
    { id: "poker", name: "Poker", emoji: "♠️" },
    { id: "cricket", name: "Cricket", emoji: "🏏" },
    { id: "triathlon", name: "Triathlon", emoji: "🏃" },
    { id: "archery_shooting", name: "Archery & Shooting", emoji: "🎯" },
    { id: "badminton", name: "Badminton", emoji: "🏸" },
    { id: "table_tennis", name: "Table Tennis", emoji: "🏓" }
  ],

  /* Jersey Sizes */
  JERSEY_SIZES: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],

  /* Maximum photo upload size in MB */
  MAX_UPLOAD_MB: 8
};
