export interface Release {
  version: string;
  date: string;
  highlights: { title: string; detail: string }[];
}

export const RELEASES: Release[] = [
  {
    version: "1.3.1",
    date: "2026-09-27",
    highlights: [
      {
        title: "Faster first load",
        detail:
          "The dashboard opens faster after a pause. Refresh also finishes faster.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-09-26",
    highlights: [
      {
        title: "Add the dashboard to your home screen",
        detail:
          "Install the dashboard from the browser menu. It opens in its own window with the dollar icon.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-09-22",
    highlights: [
      {
        title: "Spending insights",
        detail:
          "Open Insights to see your top merchants, card visits by weekday, and when each merchant usually returns.",
      },
      {
        title: "Merchant habits table",
        detail:
          "Sort merchants by visits, spend, and timing. Category cells use the same colors as the transaction tables.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-09-17",
    highlights: [
      {
        title: "Selection in the table header",
        detail:
          "Select all transactions from the table header. Clear the selection from the selected-count control.",
      },
    ],
  },
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
