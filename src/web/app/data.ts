import { useEffect, useState } from "react";
import { buildLabels, type Labels, type Names } from "../../core/labels.ts";
import type { Categorized } from "../../core/types.ts";

type Payload = { txns: Categorized[]; names: Names };

export type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; txns: Categorized[]; labels: Labels };

export const useTransactions = (): [Load, () => void] => {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

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
  }, [nonce]);

  return [load, () => setNonce((n) => n + 1)];
};

export type Refresh = {
  busy: boolean;
  note: string | null;
  bad: boolean;
  run: () => void;
};

export const useRefresh = (onDone: () => void): Refresh => {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  const run = () => {
    setBusy(true);
    setNote(null);
    // Not POST. Easy Auth authenticates a session cookie on GET alone, and
    // refuses every other method with 403 before the request arrives.
    fetch("/api/refresh", { headers: { "X-Banking-Refresh": "1" } })
      .then(async (r) => {
        // Check the status first. A gateway answers with an empty body, and
        // `json()` on that reports a parse error rather than the status.
        if (!r.ok)
          throw new Error(`${r.status} ${(await r.text()) || "(no body)"}`);
        const body = (await r.json()) as {
          rows?: number;
          fetched?: number;
          stopped?: string | null;
          error?: string;
        };
        if (body.error) throw new Error(body.error);
        // A stopped run still wrote every file it got, so the rebuild stands.
        setBad(!!body.stopped);
        setNote(
          body.stopped ??
            `${body.fetched} file(s) fetched, ${body.rows} rows rebuilt.`,
        );
        onDone();
      })
      .catch((e: unknown) => {
        setBad(true);
        setNote(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setBusy(false));
  };

  return { busy, note, bad, run };
};

// The bar sticks only while the reader goes up. Going down it keeps its place
// in the flow, so it leaves at the speed of the scroll, from the first pixel,
// and it can never show the hole where it sat. A sticky bar that hides by any
// other means shows that hole until the page scrolls its whole height.
// 8 px ignores the jitter that a tap makes on iOS, and the rubber band.
export const headerShown = (
  y: number,
  last: number,
  shown: boolean,
): boolean => (Math.abs(y - last) < 8 ? shown : y < last);

export const useStickyOnScrollUp = (): boolean => {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setShown((was) => headerShown(y, last, was));
      if (Math.abs(y - last) >= 8) last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return shown;
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
