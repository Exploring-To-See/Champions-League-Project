# Supabase Setup Guide — Champions League Tournament

Follow these 3 steps to connect your Supabase database:

1. **Create a Supabase Project**:
   - Go to [https://supabase.com](https://supabase.com) and create a free project.

2. **Run SQL Schema**:
   - Open your project dashboard -> **SQL Editor** -> **New query**.
   - Copy the contents of `supabase/schema.sql` and paste it into the editor.
   - Click **Run**. This creates the `registrations` table, storage bucket, and RLS policies.

3. **Copy Credentials**:
   - Go to **Project Settings** -> **API**.
   - Copy **Project URL** and **anon / public** API Key.
   - Paste them into `js/config.js` or set them as environment variables in Vercel.
