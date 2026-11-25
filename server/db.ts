/**
 * Local-first persistence. Everything lives in ./data (or DESTINIE_DATA_DIR):
 *   studio.sqlite   project, identity, versions, reviews
 *   uploads/        private reference photographs
 *   generated/      images returned by a provider
 *   models/         GLB / GLTF / FBX / OBJ imports
 *   audio/          vocal and instrumental takes
 *   exports/        generated identity documents and prompt packs
 *
 * None of these paths are ever served as static files.
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { defaultProfile } from "../shared/identity";
import type { IdentityProfile } from "../shared/types";

export const DATA_DIR = resolve(Bun.env.DESTINIE_DATA_DIR ?? join(process.cwd(), "data"));
export const UPLOAD_DIR = join(DATA_DIR, "uploads");
export const GENERATED_DIR = join(DATA_DIR, "generated");
export const MODEL_DIR = join(DATA_DIR, "models");
export const AUDIO_DIR = join(DATA_DIR, "audio");
export const EXPORT_DIR = join(DATA_DIR, "exports");
export const MEDIA_DIR = join(DATA_DIR, "media");

for (const dir of [DATA_DIR, UPLOAD_DIR, GENERATED_DIR, MODEL_DIR, AUDIO_DIR, EXPORT_DIR, MEDIA_DIR]) {
  mkdirSync(dir, { recursive: true });
}

export const db = new Database(join(DATA_DIR, "studio.sqlite"), { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");

db.exec(`
CREATE TABLE IF NOT EXISTS identity (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  master_version_id TEXT,
  master_photo_id TEXT
);

CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  based_on TEXT,
  change_summary TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  view TEXT NOT NULL,
  expression TEXT NOT NULL DEFAULT '',
  hairstyle TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  analysis_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  view TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  negative_prompt TEXT NOT NULL DEFAULT '',
  params_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  error TEXT,
  asset_id TEXT,
  review TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  format TEXT NOT NULL,
  source TEXT NOT NULL,
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  lod TEXT NOT NULL DEFAULT '',
  rigged INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audio (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  duration REAL,
  analysis_json TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS creations (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  collection TEXT NOT NULL DEFAULT '',
  generation_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  preset INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  duration REAL NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'uploaded',
  allow_training INTEGER NOT NULL DEFAULT 1,
  approved INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  analysis_summary_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recording_analysis (
  recording_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  derived_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  recording_id TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  emotion TEXT NOT NULL DEFAULT '',
  start REAL NOT NULL,
  end REAL NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  review TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mannerisms (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  occurrences INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'unverified',
  agreement_json TEXT NOT NULL DEFAULT '{}',
  review TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'suggested',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS behavior_profiles (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  content_json TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  approved_at TEXT,
  flags_json TEXT NOT NULL DEFAULT '[]'
);
`);

// Older databases predate profile flags; add the column without touching data.
const profileColumns = db.query("PRAGMA table_info(behavior_profiles)").all() as { name: string }[];
if (!profileColumns.some((column) => column.name === "flags_json")) {
  db.exec("ALTER TABLE behavior_profiles ADD COLUMN flags_json TEXT NOT NULL DEFAULT '[]'");
}

const mannerismColumns = db.query("PRAGMA table_info(mannerisms)").all() as { name: string }[];
if (!mannerismColumns.some((column) => column.name === "agreement_json")) {
  db.exec("ALTER TABLE mannerisms ADD COLUMN agreement_json TEXT NOT NULL DEFAULT '{}'");
}
// Earlier builds stored "supported" from footage quantity alone. Agreement was
// never measured for those rows, so they must not keep that label.
db.exec("UPDATE mannerisms SET confidence = 'unverified' WHERE confidence = 'supported'");

export const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Identity + versions                                                 */
/* ------------------------------------------------------------------ */

export function ensureIdentity() {
  const existing = db.query("SELECT * FROM identity LIMIT 1").get() as
    | { id: string; name: string; created_at: string; master_version_id: string | null; master_photo_id: string | null }
    | null;

  if (existing) {
    const draft = getDraftVersion(existing.id);
    if (!draft) createVersion(existing.id, defaultProfile(existing.name), "Draft v1");
    return existing;
  }

  const id = randomUUID();
  db.query("INSERT INTO identity (id, name, created_at) VALUES (?, ?, ?)").run(
    id,
    "DESTINIE | MASTER DIGITAL IDENTITY",
    now(),
  );
  createVersion(id, defaultProfile("DESTINIE | MASTER DIGITAL IDENTITY"), "Draft v1");
  return db.query("SELECT * FROM identity LIMIT 1").get() as {
    id: string;
    name: string;
    created_at: string;
    master_version_id: string | null;
    master_photo_id: string | null;
  };
}

export const IDENTITY_NAME = "DESTINIE | MASTER DIGITAL IDENTITY";

export function getIdentityRow() {
  return db.query("SELECT * FROM identity LIMIT 1").get() as {
    id: string;
    name: string;
    created_at: string;
    master_version_id: string | null;
    master_photo_id: string | null;
  };
}

export function createVersion(
  identityId: string,
  profile: IdentityProfile,
  label: string,
  options: { notes?: string; basedOn?: string | null; changeSummary?: string } = {},
) {
  const max = db.query("SELECT COALESCE(MAX(number), 0) AS n FROM versions WHERE identity_id = ?").get(identityId) as { n: number };
  const id = randomUUID();
  db.query(
    `INSERT INTO versions (id, identity_id, number, label, status, profile_json, created_at, notes, based_on, change_summary)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    identityId,
    max.n + 1,
    label,
    JSON.stringify(profile),
    now(),
    options.notes ?? "",
    options.basedOn ?? null,
    options.changeSummary ?? "",
  );
  const created = getVersionRow(id);
  if (!created) throw new Error("The identity version could not be created.");
  return created;
}

export function getVersionRow(id: string) {
  return db.query("SELECT * FROM versions WHERE id = ?").get(id) as VersionRow | null;
}

export function getDraftVersion(identityId: string) {
  return db
    .query("SELECT * FROM versions WHERE identity_id = ? AND status = 'draft' ORDER BY number DESC LIMIT 1")
    .get(identityId) as VersionRow | null;
}

export function getMasterVersion(identityId: string) {
  const identity = getIdentityRow();
  if (!identity?.master_version_id) return null;
  return getVersionRow(identity.master_version_id);
}

export interface VersionRow {
  id: string;
  identity_id: string;
  number: number;
  label: string;
  status: string;
  profile_json: string;
  created_at: string;
  approved_at: string | null;
  notes: string;
  based_on: string | null;
  change_summary: string;
}

export function mapVersion(row: VersionRow) {
  return {
    id: row.id,
    identityId: row.identity_id,
    number: row.number,
    label: row.label,
    status: row.status,
    profile: JSON.parse(row.profile_json) as IdentityProfile,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    notes: row.notes,
    basedOn: row.based_on,
    changeSummary: row.change_summary,
  };
}

export function approveVersion(identityId: string, versionId: string) {
  const version = getVersionRow(versionId);
  if (!version) return null;
  const stamp = now();
  db.transaction(() => {
    db.query("UPDATE versions SET status = 'superseded' WHERE identity_id = ? AND status IN ('approved')").run(identityId);
    db.query("UPDATE versions SET status = 'approved', approved_at = ? WHERE id = ?").run(stamp, versionId);
    db.query("UPDATE identity SET master_version_id = ? WHERE id = ?").run(versionId, identityId);
  })();
  return getVersionRow(versionId);
}

export function updateDraftProfile(identityId: string, profile: IdentityProfile) {
  const draft = getDraftVersion(identityId);
  if (draft) {
    db.query("UPDATE versions SET profile_json = ? WHERE id = ?").run(JSON.stringify(profile), draft.id);
    return draft.id;
  }
  return createVersion(identityId, profile, "Draft v1").id;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function readSettings(): Record<string, unknown> {
  const rows = db.query("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

export function writeSettings(patch: Record<string, unknown>) {
  const stmt = db.query(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, value] of Object.entries(patch)) stmt.run(key, JSON.stringify(value));
}

/* ------------------------------------------------------------------ */
/* Stats                                                              */
/* ------------------------------------------------------------------ */

export function storageUsage(): number {
  const row = db
    .query(
      `SELECT
        (SELECT COALESCE(SUM(bytes),0) FROM photos) +
        (SELECT COALESCE(SUM(bytes),0) FROM assets) +
        (SELECT COALESCE(SUM(bytes),0) FROM models) +
        (SELECT COALESCE(SUM(bytes),0) FROM audio) +
        (SELECT COALESCE(SUM(bytes),0) FROM recordings) AS total`,
    )
    .get() as { total: number };
  return row.total ?? 0;
}
