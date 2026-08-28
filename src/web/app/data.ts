import { useEffect, useRef, useState } from "react";
import { buildLabels, type Labels, type Names } from "../../core/labels.ts";
import type { RuleFile, Rules } from "../../core/ruleFiles.ts";
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

export type RulesData = {
  files: Record<RuleFile, Rules>;
  versions: Record<RuleFile, number[]>;
};

export type RulesApi = {
  data: RulesData | null;
  busy: boolean;
  note: string | null;
  bad: boolean;
  save: (file: RuleFile, key: string, value?: string, was?: string) => void;
  saveGroup: (file: RuleFile, keys: string[], value: string) => void;
  remove: (file: RuleFile, key: string) => void;
  undo: (file: RuleFile) => void;
  restore: (file: RuleFile, at: number) => void;
};

const rulesUrl = (
  route: string,
  params: Record<string, string | undefined>,
): string => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v);
  return `/api/rules/${route}?${q.toString()}`;
};

// The same shape as the refresh, and for the same reason: Easy Auth answers a
// session cookie on GET alone, so the custom header carries the whole guard.
const ask = async (url: string): Promise<Record<string, unknown>> => {
  const r = await fetch(url, { headers: { "X-Banking-Rules": "1" } });
  const body = (await r.text()) || "(no body)";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`${r.status} ${body}`);
  }
  if (!r.ok || parsed["error"])
    throw new Error(String(parsed["error"] ?? `${r.status} ${body}`));
  return parsed;
};

export const useRules = (onRebuilt: () => void): RulesApi => {
  const [data, setData] = useState<RulesData | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);

  const read = () =>
    fetch("/api/rules")
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
        return (await r.json()) as RulesData;
      })
      .then(setData);

  useEffect(() => {
    read().catch((e: unknown) => {
      setBad(true);
      setNote(e instanceof Error ? e.message : String(e));
    });
  }, []);

  const run = (url: string, said: string) => {
    pending.current += 1;
    setBusy(true);
    setNote(null);
    setBad(false);
    queue.current = queue.current
      .then(() => ask(url))
      .then(async (body) => {
        await read();
        setNote(`${said} ${String(body["rows"])} rows rebuilt.`);
        onRebuilt();
      })
      .catch((e: unknown) => {
        setBad(true);
        setNote(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        pending.current -= 1;
        setBusy(pending.current > 0);
      });
  };

  return {
    data,
    busy,
    note,
    bad,
    save: (file, key, value, was) =>
      run(rulesUrl("save", { file, key, value, was }), "Saved."),
    saveGroup: (file, keys, value) => {
      const q = new URLSearchParams({ file, value });
      for (const key of keys) q.append("key", key);
      run(`/api/rules/group?${q}`, "Saved.");
    },
    remove: (file, key) =>
      run(rulesUrl("save", { file, key, remove: "1" }), "Removed."),
    undo: (file) => run(rulesUrl("undo", { file }), "Undone."),
    restore: (file, at) =>
      run(rulesUrl("restore", { file, at: String(at) }), "Restored."),
  };
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
