export interface Release {
  version: string;
  date: string;
  highlights: { title: string; detail: string }[];
}

export const RELEASES: Release[] = [
  {
    version: "1.0.0",
    date: "2026-09-14",
    highlights: [
      {
        title: "A clear view of your spending",
        detail:
          "Compare periods, follow category trends, and inspect the transactions behind every total.",
      },
      {
        title: "Transaction and rule tools",
        detail:
          "Search transactions, edit classifications in bulk, and restore earlier rule versions from one place.",
      },
      {
        title: "Release notes in the app",
        detail:
          "Open Release notes from the page footer to see the important features in each release.",
      },
    ],
  },
];

export const CURRENT_RELEASE = RELEASES[0]!;
