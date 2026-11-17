import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { bulkFilters, type BulkFile } from "../../core/bulkRules.ts";
import { withItems } from "../../core/items.ts";
import type { RuleFile } from "../../core/ruleFiles.ts";
import {
  axisBounds,
  clearFilters,
  distinctCategories,
  distinctMonths,
  distinctSubcategories,
  distinctYears,
  groupAt,
  inRange,
  matchesFilters,
  period,
  pruneGroups,
  withGroupAt,
  todayOslo,
  type Filters,
} from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { AppSidebar, VIEWS, VIEW_LABEL } from "./AppSidebar.tsx";
import { BulkTransactions } from "./BulkTransactions.tsx";
import { GROUP_SHORTCUT } from "./chartGroup.ts";
import { Dashboard } from "./Dashboard.tsx";
import {
  THEMES,
  mapRules,
  readTheme,
  setTheme,
  useHideOnScroll,
  useRefresh,
  useRules,
  useTransactions,
  type Theme,
} from "./data.ts";
import {
  FilterButton,
  FilterChips,
  axisSpecs,
  activeCount,
  groupLabels,
  type View,
} from "./FilterBar.tsx";
import type { Scope } from "./FilterPanel.tsx";
import { setCategoryHues, setLabels } from "./format.ts";
import { Header, LoadNote, RefreshButton } from "./Header.tsx";
import { useFilterOptions } from "./options.ts";
import { PeriodPicker } from "./PeriodPicker.tsx";
import { ReleaseNotesDialog } from "./Releases.tsx";
import { useChecks } from "./Checks.tsx";
import { ConflictDialog } from "./ConflictDialog.tsx";
import { useConflictGuard } from "./conflictGuard.ts";
import { RULE_TABS, type RuleTab } from "./ruleMeta.ts";
import { FileDialog } from "./RuleDialog.tsx";
import { RuleHeading, RuleSearch, RulesView } from "./Rules.tsx";
import { SearchBox } from "./SearchBox.tsx";
import { ShortcutsDialog, useShortcuts, type Shortcut } from "./Shortcuts.tsx";
import { TransactionsView } from "./TransactionsView.tsx";
import { SidebarInset, SidebarProvider } from "./ui/sidebar.tsx";
import { Toaster } from "./ui/sonner.tsx";
import { TooltipProvider } from "./ui/tooltip.tsx";
import { GRAINS, readUrl, writeUrl, type Grain } from "./url.ts";

const NO_TXNS: Categorized[] = [];

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
  const refresh = useRefresh(
    reload,
    load.status === "ready" && load.refreshing,
  );
  const saved = useRules(reload);
  const [filing, setFiling] = useState<{
    txn: Categorized;
    file: RuleFile;
  } | null>(null);
  const [initial] = useState(readUrl);
  const [view, setView] = useState<View>(initial.view);
  const shownView = useDeferredValue(view);
  const [ruleFile, setRuleFile] = useState<RuleTab>(initial.ruleFile);
  const [find, setFind] = useState("");
  const [chosen, setChosen] = useState<string | null>(initial.period);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [scope, setScope] = useState<Scope | null>(null);
  const [editing, setEditing] = useState(0);
  const onScope = (next: Scope | null) => {
    setScope(next);
    if (next !== null) return;
    setEditing(0);
    setFilters(pruneGroups);
  };
  const [chosenGrain, setChosenGrain] = useState<Grain>(initial.grain);
  const [group, setGroup] = useState(initial.group);
  const [sort, setSort] = useState(initial.sort);
  const [theme, onTheme] = useState<Theme>(readTheme);
  const [help, setHelp] = useState(false);
  const [releases, setReleases] = useState(false);
  const header = useRef<HTMLElement>(null);
  const hidden = useHideOnScroll(header, filters);
  useNoteToast(refresh.note, refresh.bad);
  useNoteToast(saved.note, saved.bad);

  if (load.status === "ready") {
    setLabels(load.labels);
    setCategoryHues(distinctCategories(load.txns));
  }

  const names = mapRules(saved, "items");
  const loaded = load.status === "ready" ? load.txns : NO_TXNS;
  const kindRules = mapRules(saved, "item-categories");
  const txns = useMemo(
    () => withItems(loaded, names, kindRules),
    [loaded, names, kindRules],
  );
  const { rules, pending } = useConflictGuard(saved, txns);
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

  const checks = useChecks(rules, txns, view === "settings");
  const { counts } = checks;

  const offered = [...months, ...years, "all"];
  const active =
    chosen &&
    (offered.includes(chosen) ||
      ["custom", "recent"].includes(period(chosen).kind))
      ? chosen
      : (months[months.length - 1] ?? "all");
  const p = useMemo(() => period(active), [active]);

  const grains = GRAINS[p.kind];
  const grain = grains.includes(chosenGrain) ? chosenGrain : grains[0]!;

  useEffect(
    () =>
      writeUrl({ view, ruleFile, period: chosen, grain, group, sort, filters }),
    [view, ruleFile, chosen, grain, group, sort, filters],
  );

  useLayoutEffect(() => window.scrollTo(0, 0), [view]);

  const steps = p.kind === "month" ? months : p.kind === "year" ? years : [];
  const nextStep = (by: number) => steps[steps.indexOf(active) + by];
  const step = (by: number) => {
    const next = nextStep(by);
    if (next) setChosen(next);
  };

  const stepBy = (by: number) => {
    if (view !== "settings") return step(by);
    setRuleFile(
      (f) =>
        RULE_TABS[
          (RULE_TABS.indexOf(f) + by + RULE_TABS.length) % RULE_TABS.length
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
    ...VIEWS.map(([v], i): Shortcut => ({
      keys: [String(i + 1)],
      cap: String(i + 1),
      what: VIEW_LABEL[v],
      run: () => setView(v),
    })),
    {
      keys: ["ArrowLeft"],
      cap: "←",
      what:
        view === "settings"
          ? "The settings tab before"
          : "The month or year before",
      run: () => stepBy(-1),
    },
    {
      keys: ["ArrowRight"],
      cap: "→",
      what:
        view === "settings"
          ? "The settings tab after"
          : "The month or year after",
      run: () => stepBy(1),
    },
    {
      keys: ["t"],
      cap: "t",
      what: "Today — this month, or this year in a year view",
      run: () => {
        if (view === "settings") return;
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
    { cap: "G", what: GROUP_SHORTCUT },
    {
      keys: ["f"],
      cap: "f",
      what: "Open the filter panel",
      run: () => view !== "settings" && setScope("home"),
    },
    {
      keys: ["e"],
      cap: "e",
      what: "Show or hide internal transfers",
      run: () => setFilters((f) => ({ ...f, showExcluded: !f.showExcluded })),
    },
    {
      keys: ["r"],
      cap: "r",
      what: "Clear every filter",
      run: () => setFilters(clearFilters),
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
    { cap: "/ ⌘F", what: "Search merchants, items or rules" },
    { keys: ["?"], cap: "?", what: "This list", run: () => setHelp(true) },
  ];
  useShortcuts(shortcuts);

  const inPeriod = useMemo(
    () => txns.filter((t) => inRange(t, p.from, p.to)),
    [txns, p],
  );
  const options = useFilterOptions(inPeriod, filters, names, kindRules);
  const specs = axisSpecs(options);
  const matching = useMemo(
    () =>
      scope ? inPeriod.filter((t) => matchesFilters(t, filters)).length : 0,
    [scope, inPeriod, filters],
  );

  const views: Record<View, () => ReactNode> = {
    settings: () => (
      <RulesView
        rules={rules}
        txns={txns}
        pairs={pairs}
        file={ruleFile}
        checks={checks}
        find={find}
      />
    ),
    overview: () => (
      <Dashboard
        txns={txns}
        all={inPeriod}
        filters={filters}
        onFilters={setFilters}
        rules={rules}
        period={p}
        grain={grain}
        offered={grains}
        onGrain={setChosenGrain}
      />
    ),
    transactions: () => (
      <TransactionsView
        rows={inPeriod}
        all={txns}
        rules={rules}
        filters={filters}
        onFilters={setFilters}
        onFile={(txn, file) => setFiling({ txn, file })}
        onBulk={(selected, file) => setBulk({ selected, all: txns, file })}
        group={group}
        onGroup={setGroup}
        sort={sort}
        onSort={setSort}
      />
    ),
  };
  const body =
    ready || shownView === "settings" ? (
      views[shownView]()
    ) : (
      <LoadNote
        load={load}
        count={txns.length}
        refresh={refresh}
        list={shownView === "transactions"}
      />
    );

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider
        defaultOpen={!document.cookie.includes("sidebar_state=false")}
      >
        <AppSidebar
          view={view}
          onView={setView}
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
            title={
              {
                ...VIEW_LABEL,
                settings: (
                  <RuleHeading
                    file={ruleFile}
                    onFile={setRuleFile}
                    counts={counts}
                  />
                ),
              }[view]
            }
            action={<RefreshButton refresh={refresh} />}
            controls={
              view === "settings" ? (
                <RuleSearch file={ruleFile} find={find} onFind={setFind} />
              ) : (
                <>
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
                  <FilterButton
                    specs={specs}
                    filters={groupAt(filters, editing)}
                    onFilters={(next) =>
                      setFilters((f) => withGroupAt(f, editing, next))
                    }
                    scope={scope}
                    onScope={onScope}
                    matching={matching}
                    count={activeCount(specs, filters)}
                    deposit={view === "overview"}
                    group={editing}
                    groups={groupLabels(specs, filters, editing)}
                    onGroup={setEditing}
                  />
                  <SearchBox
                    hotkey
                    value={filters.search}
                    onChange={(search) => setFilters((f) => ({ ...f, search }))}
                    placeholder="Search merchants and items"
                    className="max-sm:order-last max-sm:basis-full sm:w-64 lg:w-80"
                  />
                </>
              )
            }
          >
            {view !== "settings" && (
              <FilterChips
                specs={specs}
                rows={inPeriod}
                filters={filters}
                onFilters={setFilters}
                onEdit={(group, next) => {
                  setEditing(group);
                  setScope(next);
                }}
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
      <ConflictDialog pending={pending} />
      <Toaster theme={theme} position="bottom-right" />
    </TooltipProvider>
  );
};
