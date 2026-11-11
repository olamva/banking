export interface Highlight {
  title: string;
  detail: string;
}

export type Bump = "major" | "minor" | "patch";

export interface Note {
  bump: Bump;
  highlights: Highlight[];
}

export interface Release {
  version: string;
  date: string;
  highlights: Highlight[];
}

export const BUMPS: Bump[] = ["major", "minor", "patch"];

export const NOTE_NAME = /^(\d{4}-\d{2}-\d{2})-\d{4}-[a-z0-9-]+\.json$/;

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
        date: name.slice(0, 10),
        highlights,
      };
    })
    .reverse();
}
