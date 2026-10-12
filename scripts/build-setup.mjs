// Concatenates migrations + seed into supabase/setup.sql for one-paste setup in the Supabase SQL editor.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const dir = new URL("../supabase/migrations/", import.meta.url);
const parts = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => `-- ===== ${f} =====\n${readFileSync(new URL(f, dir), "utf8")}`);
parts.push(`-- ===== seed.sql =====\n${readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8")}`);
writeFileSync(new URL("../supabase/setup.sql", import.meta.url), `-- FLAME PH one-time database setup. Paste into Supabase → SQL Editor → Run.\n\n${parts.join("\n\n")}`);
console.log("Wrote supabase/setup.sql");
