// App Service keeps only /home across a restart, and wwwroot is read-only under
// WEBSITE_RUN_FROM_PACKAGE. Both roots therefore move by environment there.
const root = (key: string, fallback: string): string =>
  process.env[key]?.replace(/\/+$/, "") || fallback;

export const DATA_DIR = root("DATA_DIR", "data");
export const RULES_DIR = root("RULES_DIR", "rules");

// SQLite needs byte-range locks, and an SMB share does not carry them. Every
// open runs CREATE TABLE IF NOT EXISTS, so even a read writes. On a mounted
// volume that fails with "database is locked". The database is derived, so it
// sits on the local disk and a cold start builds it again from DATA_DIR/raw.
export const DB_FILE = process.env.DB_FILE || `${DATA_DIR}/banking.db`;
