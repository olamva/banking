import { useEffect, useState } from "react";
import { buildLabels, type Labels, type Names } from "../../core/labels.ts";
import type { Categorized } from "../../core/types.ts";

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

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

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
