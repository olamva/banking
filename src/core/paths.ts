const root = (key: string, fallback: string): string =>
  process.env[key]?.replace(/\/+$/, "") || fallback;

export const DATA_DIR = root("DATA_DIR", "data");
export const RULES_DIR = root("RULES_DIR", "rules");

export const DB_FILE = process.env.DB_FILE || `${DATA_DIR}/banking.db`;
