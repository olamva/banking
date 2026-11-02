import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { bulkFilters, type BulkFile } from "../../core/bulkRules.ts";
import { RULE_FILES, type RuleFile } from "../../core/ruleFiles.ts";
import {
  NO_FILTERS,
  axisBounds,
  distinctCategories,
  distinctMonths,
  distinctSubcategories,
  distinctYears,
  inRange,
  period,
  todayOslo,
  type Filters,
} from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { AppSidebar, VIEW_LABEL } from "./AppSidebar.tsx";
import { BulkTransactions } from "./BulkTransactions.tsx";
import { Dashboard, pick } from "./Dashboard.tsx";
import {
  THEMES,
  readTheme,
  setTheme,
  useHideOnScroll,
  useRefresh,
  useRules,
  useTransactions,
  type Theme,
} from "./data.ts";
import { FilterBar, type View } from "./FilterBar.tsx";
import { setCategoryHues, setLabels } from "./format.ts";
import { Header, LoadNote, RefreshButton } from "./Header.tsx";
import { Insights } from "./Insights.tsx";
import { useFilterOptions } from "./options.ts";
import { PeriodPicker } from "./PeriodPicker.tsx";
import { ReleaseNotesDialog } from "./Releases.tsx";
import { RULE_TAB_FILES, entriesOf } from "./ruleMeta.ts";
import { FileDialog } from "./RuleDialog.tsx";
import { RuleFileSelect, RulesView } from "./Rules.tsx";
import { ShortcutsDialog, useShortcuts, type Shortcut } from "./Shortcuts.tsx";
import { TransactionsView } from "./TransactionsView.tsx";
import { SidebarInset, SidebarProvider } from "./ui/sidebar.tsx";
import { Toaster } from "./ui/sonner.tsx";
import { TooltipProvider } from "./ui/tooltip.tsx";
import { GRAINS, readUrl, writeUrl, type Grain } from "./url.ts";

const useNoteToast = (note: string | null, bad: boolean) =>
  useEffect(() => {
    if (note === null) return;
    if (bad) toast.error(note, { duration: Infinity, closeButton: true });
    else toast.success(note);
  }, [note, bad]);

export const App = () => {
  const [load, reload] = useTransactions();
  const [bulk, setBulk] = useState<{
    selected: Categorized[];
    all: Categorized[];
    file: BulkFile;
  } | null>(null);
  const refresh = useRefresh(reload);
  const rules = useRules(reload);
  const [filing, setFiling] = useState<{
    txn: Categorized;
    file: RuleFile;
  } | null>(null);
  const [initial] = useState(readUrl);
  const [view, setView] = useState<View>(initial.view);
  const shownView = useDeferredValue(view);
  const [ruleFile, setRuleFile] = useState<RuleFile>(initial.ruleFile);
  const [chosen, setChosen] = useState<string | null>(initial.period);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [chosenGrain, setChosenGrain] = useState<Grain>(initial.grain);
  const [theme, onTheme] = useState<Theme>(readTheme);
  const [help, setHelp] = useState(false);
  const [releases, setReleases] = useState(false);
  const header = useRef<HTMLElement>(null);
  const hidden = useHideOnScroll(header, filters);
  useNoteToast(refresh.note, refresh.bad);
  useNoteToast(rules.note, rules.bad);

  if (load.status === "ready") {
    setLabels(load.labels);
    setCategoryHues(distinctCategories(load.txns));
  }

  const txns = load.status === "ready" ? load.txns : [];
  const ready = txns.length > 0;
  const months = useMemo(() => distinctMonths(txns), [txns]);
  const years = useMemo(() => distinctYears(txns), [txns]);
  const record = useMemo(() => axisBounds(txns, period("all")), [txns]);

  const pairs = useMemo(
    () =>
      [
        ...new Set([
          ...distinctCategories(txns),
          ...distinctSubcategories(txns),
        ]),
      ].sort(),
    [txns],
  );

  const counts = useMemo(
    (): Partial<Record<RuleFile, number>> =>
      rules.data
        ? Object.fromEntries(
            RULE_FILES.map((f) => [f, entriesOf(rules.data!.files[f]).length]),
          )
        : {},
    [rules.data],
  );

  const offered = [...months, ...years, "all"];
  const active =
    chosen && (offered.includes(chosen) || period(chosen).kind === "custom")
      ? chosen
      : (months[months.length - 1] ?? "all");
  const p = useMemo(() => period(active), [active]);

  const grains = GRAINS[p.kind];
  const grain = grains.includes(chosenGrain) ? chosenGrain : grains[0]!;

  useEffect(
    () => writeUrl({ view, ruleFile, period: chosen, grain, filters }),
    [view, ruleFile, chosen, grain, filters],
  );

  const changeView = (next: View) => {
    if (view === "transactions" && next !== "transactions")
      setFilters((f) => ({ ...f, search: "" }));
    setView(next);
  };

  const steps = p.kind === "month" ? months : p.kind === "year" ? years : [];
  const nextStep = (by: number) => steps[steps.indexOf(active) + by];
  const step = (by: number) => {
    const next = nextStep(by);
    if (next) setChosen(next);
  };

  const stepBy = (by: number) => {
    if (view !== "rules") return step(by);
    setRuleFile(
      (f) =>
        RULE_TAB_FILES[
          (RULE_TAB_FILES.indexOf(f) + by + RULE_TAB_FILES.length) %
            RULE_TAB_FILES.length
        ]!,
    );
  };

  const inView = active.slice(0, 4);
  const year = years.includes(inView) ? inView : years[years.length - 1];
  const lastMonthOf = (y: string) =>
    months.filter((m) => m.startsWith(`${y}-`)).at(-1);

  const changeTheme = (next: Theme) => {
    onTheme(next);
    setTheme(next);
  };

  const shortcuts: Shortcut[] = [
    ...(["dashboard", "transactions", "insights", "rules"] as const).map(
      (v, i): Shortcut => ({
        keys: [String(i + 1)],
        cap: String(i + 1),
        what: VIEW_LABEL[v],
        run: () => changeView(v),
      }),
    ),
    {
      keys: ["ArrowLeft"],
      cap: "←",
      what:
        view === "rules" ? "The rule file before" : "The month or year before",
      run: () => stepBy(-1),
    },
    {
      keys: ["ArrowRight"],
      cap: "→",
      what:
        view === "rules" ? "The rule file after" : "The month or year after",
      run: () => stepBy(1),
    },
    {
      keys: ["t"],
      cap: "t",
      what: "Today — this month, or this year in a year view",
      run: () => {
        if (view === "rules") return;
        const now = todayOslo();
        const it = p.kind === "year" ? now.slice(0, 4) : now.slice(0, 7);
        if (offered.includes(it)) setChosen(it);
      },
    },
    { keys: ["a"], cap: "a", what: "All time", run: () => setChosen("all") },
    {
      keys: ["y"],
      cap: "y",
      what: "The whole year — the latest, from all time",
      run: () => year && setChosen(year),
    },
    {
      keys: ["m"],
      cap: "m",
      what: "The last month of that year",
      run: () => {
        const m = year && lastMonthOf(year);
        if (m) setChosen(m);
      },
    },
    {
      keys: ["g"],
      cap: "g",
      what: "Next grain on the spending chart",
      run: () =>
        setChosenGrain(grains[(grains.indexOf(grain) + 1) % grains.length]!),
    },
    {
      keys: ["e"],
      cap: "e",
      what: "Show or hide excluded rows",
      run: () => setFilters((f) => ({ ...f, showExcluded: !f.showExcluded })),
    },
    {
      keys: ["r"],
      cap: "r",
      what: "Reset every filter",
      run: () => setFilters(NO_FILTERS),
    },
    {
      keys: ["c"],
      cap: "c",
      what: "Next theme",
      run: () =>
        changeTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!),
    },
    {
      keys: ["R"],
      cap: "R",
      what: "Refresh from the bank",
      run: () => {
        if (!refresh.busy) refresh.run();
      },
    },
    { cap: "⌘ B", what: "Show or hide the sidebar" },
    { cap: "/ ⌘F", what: "Search the transactions table" },
    { keys: ["?"], cap: "?", what: "This list", run: () => setHelp(true) },
  ];
  useShortcuts(shortcuts);

  const inPeriod = useMemo(
    () => txns.filter((t) => inRange(t, p.from, p.to)),
    [txns, p],
  );
  const options = useFilterOptions(inPeriod, filters);

  const views: Record<View, () => ReactNode> = {
    rules: () => (
      <RulesView rules={rules} txns={txns} pairs={pairs} file={ruleFile} />
    ),
    dashboard: () => (
      <Dashboard
        txns={txns}
        all={inPeriod}
        filters={filters}
        onFilters={setFilters}
        period={p}
        grain={grain}
        offered={grains}
        onGrain={setChosenGrain}
      />
    ),
    insights: () => (
      <Insights
        rows={inPeriod}
        filters={filters}
        onMerchant={pick(setFilters, "merchants")}
        onCategory={pick(setFilters, "categories")}
      />
    ),
    transactions: () => (
      <TransactionsView
        rows={inPeriod}
        filters={filters}
        onFilters={setFilters}
        onFile={(txn, file) => setFiling({ txn, file })}
        onBulk={(selected, file) => setBulk({ selected, all: txns, file })}
      />
    ),
  };
  const body =
    ready || shownView === "rules" ? (
      views[shownView]()
    ) : (
      <LoadNote load={load} count={txns.length} refresh={refresh} />
    );

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider
        defaultOpen={!document.cookie.includes("sidebar_state=false")}
      >
        <AppSidebar
          view={view}
          onView={changeView}
          ruleFile={ruleFile}
          onRuleFile={setRuleFile}
          counts={counts}
          theme={theme}
          onTheme={onTheme}
          onHelp={() => setHelp(true)}
          onReleases={() => setReleases(true)}
        />
        <SidebarInset className="min-w-0">
          <Header
            ref={header}
            hidden={hidden}
            title={VIEW_LABEL[view]}
            action={<RefreshButton refresh={refresh} />}
            controls={
              view === "rules" ? (
                <RuleFileSelect
                  file={ruleFile}
                  onFile={setRuleFile}
                  counts={counts}
                />
              ) : (
                <PeriodPicker
                  months={months}
                  years={years}
                  period={active}
                  kind={p.kind}
                  from={p.from}
                  to={p.to}
                  earliest={record.from}
                  latest={record.to}
                  onPeriod={setChosen}
                  onStep={step}
                  canStep={(by) => nextStep(by) !== undefined}
                />
              )
            }
          >
            {view !== "rules" && (
              <FilterBar
                view={view}
                {...options}
                filters={filters}
                onFilters={setFilters}
              />
            )}
          </Header>
          <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
            {body}
          </div>
        </SidebarInset>
      </SidebarProvider>

      <ShortcutsDialog
        shortcuts={shortcuts}
        open={help}
        onClose={() => setHelp(false)}
      />
      <ReleaseNotesDialog open={releases} onClose={() => setReleases(false)} />
      {bulk && (
        <BulkTransactions
          {...bulk}
          pairs={pairs}
          rules={rules}
          onClose={() => setBulk(null)}
          onSaved={(file, value) =>
            setFilters((f) => bulkFilters(f, file, value))
          }
        />
      )}
      {filing && (
        <FileDialog
          txn={filing.txn}
          file={filing.file}
          rules={rules}
          txns={txns}
          pairs={pairs}
          onClose={() => setFiling(null)}
        />
      )}
      <Toaster theme={theme} position="bottom-right" />
    </TooltipProvider>
  );
};
