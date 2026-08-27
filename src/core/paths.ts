// App Service keeps only /home across a restart, and wwwroot is read-only under
// WEBSITE_RUN_FROM_PACKAGE. Both roots therefore move by environment there.
const root = (key: string, fallback: string): string =>
  process.env[key]?.replace(/\/+$/, "") || fallback;

export const DATA_DIR = root("DATA_DIR", "data");
export const RULES_DIR = root("RULES_DIR", "rules");
