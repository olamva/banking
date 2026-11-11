import { versioned, type Note } from "./releaseNotes.ts";

export type { Release } from "./releaseNotes.ts";

export const RELEASES = versioned(
  import.meta.glob<Note>("./release-notes/*.json", {
    eager: true,
    import: "default",
  }),
);

export const CURRENT_RELEASE = RELEASES[0]!;
