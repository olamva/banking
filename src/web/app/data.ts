/**
 * The one thing the page fetches: every transaction, from the local server.
 *
 * Not embedded in the HTML any more — Vite serves the shell, `serve.ts` serves
 * the rows. Kept out of the component files on purpose, so nothing that renders
 * also knows how the data arrives.
 */
import { useEffect, useState } from "react";
import { buildLabels, type Labels, type Names } from "../../core/labels.ts";
import type { Categorized } from "../../core/types.ts";

/**
 * `names` is only what `rules/categories.json` overrides — the bank's own names
 * are already on the rows, so `buildLabels` learns 68 pairs from them and this
 * map stays small.
 */
type Payload = { txns: Categorized[]; names: Names };

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; txns: Categorized[]; labels: Labels };

export const useTransactions = (): Load => {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let live = true;
    fetch("/api/txns")
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
        return (await r.json()) as Payload;
      })
      // Built once here rather than per render: it walks every row to learn what
      // the bank calls each pair, and the rows do not change after the fetch.
      .then(
        ({ txns, names }) =>
          live &&
          setLoad({ status: "ready", txns, labels: buildLabels(txns, names) }),
      )
      .catch(
        (e: unknown) =>
          live &&
          setLoad({
            status: "error",
            message: e instanceof Error ? e.message : String(e),
          }),
      );
    return () => {
      live = false;
    };
  }, []);

  return load;
};

/**
 * Theme is three-state: explicit dark, explicit light, or whatever the system
 * says. Picked outright rather than cycled — cycling ran off the stored value
 * while the CSS resolved from the system one, so the first click on an
 * already-dark page did nothing visible.
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** Clamped, so a hand-edited key cannot leave the picker with no option selected. */
export const readTheme = (): Theme => {
  const saved = localStorage.getItem("dashboardTheme") as Theme | null;
  return saved && THEMES.includes(saved) ? saved : "system";
};

export const setTheme = (t: Theme): void => {
  const html = document.documentElement;
  if (t === "system") {
    html.removeAttribute("data-theme");
    localStorage.removeItem("dashboardTheme");
  } else {
    html.setAttribute("data-theme", t);
    localStorage.setItem("dashboardTheme", t);
  }
};
