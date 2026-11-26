export const AREAS = {
  transactions: "Transactions",
  overview: "Overview",
  items: "Items",
  receipts: "Receipts",
  filters: "Filters",
  rules: "Rules",
  iphone: "iPhone",
  app: "Whole app",
} as const;

export const KINDS = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
} as const;

export type Area = keyof typeof AREAS;
export type Kind = keyof typeof KINDS;

export interface Highlight {
  title: string;
  detail: string;
  area: Area;
  kind: Kind;
}

export type Bump = "major" | "minor" | "patch";

export interface Note {
  bump: Bump;
  highlights: Highlight[];
}

export interface Release {
  version: string;
  date: string;
  bump: Bump;
  highlights: Highlight[];
}

export const BUMPS: Bump[] = ["major", "minor", "patch"];

export const LIMITS = { highlights: 3, title: 40, detail: 100 };

export const NOTE_NAME =
  /^(\d{4}-\d{2}-\d{2})(?:-\d{4}|T\d{6})-[a-z0-9-]+\.json$/;

export const PENDING_NAME = /^[a-z][a-z0-9-]*\.json$/;

const base = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function versioned(notes: Record<string, Note>): Release[] {
  let version = [0, 0, 0];
  return Object.entries(notes)
    .map(([path, note]) => [base(path), note] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, { bump, highlights }]) => {
      const at = BUMPS.indexOf(bump);
      version = version.map((n, i) => (i < at ? n : i === at ? n + 1 : 0));
      return {
        version: version.join("."),
        date:
          NOTE_NAME.exec(name)?.[1] ??
          new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }),
        bump,
        highlights,
      };
    })
    .reverse();
}
