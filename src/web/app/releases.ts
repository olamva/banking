export interface Release {
  version: string;
  date: string;
  highlights: { title: string; detail: string }[];
}

export const RELEASES: Release[] = [
  {
    version: "2.1.0",
    date: "2026-11-03",
    highlights: [
      {
        title: "Insights and receipts on iPhone",
        detail:
          "The iPhone app has an Insights tab for each year or all time. A transaction shows its receipt and can remember a new category. Summary shows the biggest changes, spending by account and income by payer. Activity filters by account and category.",
      },
    ],
  },
  {
    version: "2.0.0",
    date: "2026-11-01",
    highlights: [
      {
        title: "A new look",
        detail:
          "A sidebar holds the four views and collapses to icons. On a phone it opens from the menu button. Filters, the period, dialogs and tables use one consistent set of controls in light and dark.",
      },
      {
        title: "An iPhone app",
        detail:
          "Spending is a native iPhone app with a summary of each month, trends, every transaction and search. It signs in with the same Google account and keeps the last data for use offline.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-10-19",
    highlights: [
      {
        title: "Receipts on transactions",
        detail:
          "A transaction shows its receipt when one matches. Rema 1000 and Trumf receipts look like the till slip, with sizes, unit prices, offers, deposit and payment. A receipt mail opens in Gmail. A small receipt mark shows which rows have one.",
      },
    ],
  },
  {
    version: "1.3.2",
    date: "2026-09-27",
    highlights: [
      {
        title: "Much faster start after a pause",
        detail:
          "The page loads while the server prepares your transactions. The transactions download about seven times smaller.",
      },
    ],
  },
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
