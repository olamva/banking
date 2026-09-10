import { useEffect, useRef, useState, type RefObject } from "react";
import { buildLabels, type Labels, type Names } from "../../core/labels.ts";
import {
  changeRules,
  type RuleChange,
  type RuleFile,
  type Rules,
} from "../../core/ruleFiles.ts";
import type { Categorized } from "../../core/types.ts";

type Payload = { txns: Categorized[]; names: Names };

const msg = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const getJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.json()) as T;
};

export type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; txns: Categorized[]; labels: Labels };

export const useTransactions = (): [Load, () => void] => {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    getJson<Payload>("/api/txns")
      .then(
        ({ txns, names }) =>
          live &&
          setLoad({ status: "ready", txns, labels: buildLabels(txns, names) }),
      )
      .catch(
        (e: unknown) => live && setLoad({ status: "error", message: msg(e) }),
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
        setNote(msg(e));
      })
      .finally(() => setBusy(false));
  };

  return { busy, note, bad, run };
};

export type RuleVersion = { at: number; changes: RuleChange[] };

export type RulesData = {
  files: Record<RuleFile, Rules>;
  history: Record<RuleFile, RuleVersion[]>;
  at: Record<RuleFile, number | null>;
};

export type RulesApi = {
  data: RulesData | null;
  busy: boolean;
  note: string | null;
  bad: boolean;
  save: (file: RuleFile, key: string, value?: string, was?: string) => void;
  rebuild: () => void;
  saveBulk: (file: RuleFile, keys: string[], value: string) => Promise<boolean>;
  saveGroup: (file: RuleFile, keys: string[], value: string) => void;
  remove: (file: RuleFile, key: string) => void;
  undo: (file: RuleFile) => void;
  redo: (file: RuleFile) => void;
  restore: (file: RuleFile, at: number) => void;
};

export { changeRules } from "../../core/ruleFiles.ts";

const changedFile = (
  data: RulesData,
  file: RuleFile,
  change: (rules: Rules) => Rules,
): RulesData => ({
  ...data,
  files: { ...data.files, [file]: change(data.files[file]) },
});

const applyChanges = (
  rules: Rules,
  changes: RuleChange[],
  forward: boolean,
): Rules => {
  let next = rules;
  for (const { key, from, to } of changes) {
    const value = forward ? to : from;
    next = changeRules(next, key, value, undefined, value === undefined);
  }
  return next;
};

export const versionAt = (data: RulesData, file: RuleFile): number =>
  data.history[file].findIndex(({ at }) => at === data.at[file]);

export const moveRules = (
  data: RulesData,
  file: RuleFile,
  target: number,
): RulesData => {
  const versions = data.history[file];
  const from = versionAt(data, file);
  const to = versions.findIndex(({ at }) => at === target);
  if (from < 0 || to < 0) return data;
  let rules = data.files[file];
  if (to > from)
    for (let i = from; i < to; i++)
      rules = applyChanges(rules, versions[i]!.changes, false);
  else
    for (let i = from - 1; i >= to; i--)
      rules = applyChanges(rules, versions[i]!.changes, true);
  return {
    ...changedFile(data, file, () => rules),
    at: { ...data.at, [file]: target },
  };
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
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);

  const fail = (e: unknown) => {
    setBad(true);
    setNote(msg(e));
  };

  const read = () => getJson<RulesData>("/api/rules").then(setData);

  useEffect(() => {
    read().catch(fail);
  }, []);

  const run = (
    url: string,
    said: string,
    optimistic: (data: RulesData) => RulesData,
  ) => {
    pending.current += 1;
    setBusy(true);
    setNote(null);
    setBad(false);
    setData((current) => (current ? optimistic(current) : current));
    const result = queue.current
      .then(() => ask(url))
      .then((body) => {
        setNote(`${said} ${String(body["rows"])} rows rebuilt.`);
        onRebuilt();
        return true;
      })
      .catch((e: unknown) => {
        fail(e);
        return false;
      })
      .finally(() => {
        pending.current -= 1;
        setBusy(pending.current > 0);
        if (pending.current === 0) read().catch(fail);
      });
    queue.current = result;
    return result;
  };

  return {
    data,
    busy,
    note,
    bad,
    save: (file, key, value, was) =>
      run(rulesUrl("save", { file, key, value, was }), "Saved.", (data) =>
        changedFile(data, file, (rules) => changeRules(rules, key, value, was)),
      ),
    rebuild: () => run(rulesUrl("rebuild", {}), "Updated.", (data) => data),
    saveBulk: (file, keys, value) => {
      const q = new URLSearchParams({ file, value });
      for (const key of keys) q.append("key", key);
      return run(`/api/rules/bulk?${q}`, "Saved bulk edit.", (data) => data);
    },
    saveGroup: (file, keys, value) => {
      const q = new URLSearchParams({ file, value });
      for (const key of keys) q.append("key", key);
      run(`/api/rules/group?${q}`, "Saved.", (data) =>
        changedFile(data, file, (rules) => {
          if (Array.isArray(rules)) return rules;
          return Object.fromEntries(
            Object.entries(rules).map(([key, old]) => [
              key,
              keys.includes(key) ? value : old,
            ]),
          );
        }),
      );
    },
    remove: (file, key) =>
      run(rulesUrl("save", { file, key, remove: "1" }), "Removed.", (data) =>
        changedFile(data, file, (rules) =>
          changeRules(rules, key, undefined, undefined, true),
        ),
      ),
    undo: (file) =>
      run(rulesUrl("undo", { file }), "Undone.", (data) => {
        const target = data.history[file][versionAt(data, file) + 1]?.at;
        return target === undefined ? data : moveRules(data, file, target);
      }),
    redo: (file) =>
      run(rulesUrl("redo", { file }), "Redone.", (data) => {
        const target = data.history[file][versionAt(data, file) - 1]?.at;
        return target === undefined ? data : moveRules(data, file, target);
      }),
    restore: (file, at) =>
      run(rulesUrl("restore", { file, at: String(at) }), "Moved.", (data) =>
        moveRules(data, file, at),
      ),
  };
};

// Keep most of the header space on screen before the header hides.
// 8 px ignores tap jitter on iOS and the rubber band at both ends.
export const headerHidden = (
  y: number,
  last: number,
  hidden: boolean,
  height: number,
): boolean => (Math.abs(y - last) < 8 ? hidden : y > last && y > height - 24);

// Measured, never assumed: the bar grows a line as the filters wrap, and it
// grows another when a refresh reports.
export const useHideOnScroll = (
  header: RefObject<HTMLElement | null>,
  reset: unknown,
): boolean => {
  const [hidden, setHidden] = useState(false);

  useEffect(() => setHidden(false), [reset]);

  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () =>
      document.documentElement.style.setProperty(
        "--header-bottom",
        `${element.offsetHeight + 16}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--header-bottom");
    };
  }, [header]);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const height = header.current?.offsetHeight ?? 0;
      setHidden((was) => headerHidden(y, last, was, height));
      if (Math.abs(y - last) >= 8) last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [header]);

  return hidden;
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
