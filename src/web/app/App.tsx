import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { RULE_FILES, type RuleFile } from "../../core/ruleFiles.ts";
import {
  NO_FILTERS,
  axisBounds,
  distinctAccounts,
  distinctCategories,
  distinctCountries,
  distinctMerchants,
  distinctMonths,
  distinctSubcategories,
  distinctYears,
  inRange,
  matchesFilters,
  period,
  personMerchants,
  todayOslo,
  type Filters,
} from "../../core/select.ts";
import { totals } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import { StatTile } from "./Cards.tsx";
import { TransactionsCard } from "./Transactions.tsx";
import { LoadNote, Toolbar } from "./AppToolbar.tsx";
import { Dashboard, ExcludedNote, pick } from "./Dashboard.tsx";
import { FilterBar, type View } from "./FilterBar.tsx";
import { Notification, Notifications } from "./Modal.tsx";
import { FileDialog, RuleTabs, RulesView } from "./Rules.tsx";
import { ShortcutsDialog, useShortcuts, type Shortcut } from "./Shortcuts.tsx";
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
import {
  fmtNOK,
  setCategoryHues,
  setLabels,
  subcategoryLabel,
} from "./format.ts";
import { GRAINS, readUrl, writeUrl, type Grain } from "./url.ts";

const CARD_GRID =
  "grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] gap-4 [&>*:last-child:nth-child(odd)]:col-span-full";

type SetFilters = Dispatch<SetStateAction<Filters>>;
interface TransactionsViewProps {
  rows: Categorized[];
  filters: Filters;
  onFilters: SetFilters;
  onFile: (txn: Categorized) => void;
}

const TransactionsView = ({
  rows,
  filters,
  onFilters,
  onFile,
}: TransactionsViewProps) => {
  const search = useDeferredValue(filters.search);
  const shown = rows.filter((t) => matchesFilters(t, { ...filters, search }));
  const sums = totals(shown);

  return (
    <>
      {/* All three, always — unlike the dashboards, which hide a tile they have
          no rows for. Here the numbers move on every keystroke, and a tile that
          vanishes at zero takes the rows below it for a ride up the page. */}
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3 px-3 sm:px-0">
        <StatTile label="Spent" value={fmtNOK(sums.totalOut)} />
        <StatTile label="Income" value={fmtNOK(sums.totalIn)} />
        <StatTile label="Net" value={fmtNOK(sums.net)} />
      </div>

      <div className={CARD_GRID}>
        <TransactionsCard
          txns={shown}
          search={filters.search}
          onSearch={(search) => onFilters((f) => ({ ...f, search }))}
          onMerchant={pick(onFilters, "merchants")}
          onCategory={pick(onFilters, "categories")}
          onAccount={pick(onFilters, "accounts")}
          onFile={onFile}
        />
      </div>

      {/* Over the period, not over `shown` — the note audits the range, not the search box. */}
      <ExcludedNote excluded={totals(rows).excluded} where="in view" />
    </>
  );
};

export const App = () => {
  const [load, reload] = useTransactions();
  const refresh = useRefresh(reload);
  // A rule edit rebuilds the database, so the page must read the rows again.
  const rules = useRules(reload);
  const [filing, setFiling] = useState<Categorized | null>(null);
  const [initial] = useState(readUrl);
  const [view, setView] = useState<View>(initial.view);
  const [ruleFile, setRuleFile] = useState<RuleFile>("overrides");
  const [chosen, setChosen] = useState<string | null>(initial.period);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [chosenGrain, setChosenGrain] = useState<Grain>(initial.grain);
  const [theme, onTheme] = useState<Theme>(readTheme);
  const [help, setHelp] = useState(false);
  const header = useRef<HTMLElement>(null);
  const hidden = useHideOnScroll(header, filters);

  if (load.status === "ready") {
    setLabels(load.labels);
    setCategoryHues(distinctCategories(load.txns));
  }

  const txns = load.status === "ready" ? load.txns : [];
  const ready = txns.length > 0;
  const months = useMemo(() => distinctMonths(txns), [txns]);
  const years = useMemo(() => distinctYears(txns), [txns]);

  const record = useMemo(() => axisBounds(txns, period("all")), [txns]);

  // Over the record, not over the period. A rule claims every row it matches,
  // whichever month is on screen.
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

  const offered = [...months, ...years, "all"];
  const active =
    chosen && (offered.includes(chosen) || period(chosen).kind === "custom")
      ? chosen
      : (months[months.length - 1] ?? "all");
  const p = useMemo(() => period(active), [active]);

  const grains = GRAINS[p.kind];
  const grain = grains.includes(chosenGrain) ? chosenGrain : grains[0]!;

  useEffect(
    () => writeUrl({ view, period: chosen, grain, filters }),
    [view, chosen, grain, filters],
  );

  const changeView = (next: View) => {
    if (view === "transactions" && next !== "transactions")
      setFilters((f) => ({ ...f, search: "" }));
    setView(next);
  };

  const steps = p.kind === "month" ? months : p.kind === "year" ? years : [];
  const step = (by: number) => {
    const next = steps[steps.indexOf(active) + by];
    if (next) setChosen(next);
  };

  // The arrows move what the reader can see. The rules page carries no period,
  // so there they step the rule file instead.
  const stepBy = (by: number) => {
    if (view !== "rules") return step(by);
    setRuleFile(
      (f) =>
        RULE_FILES[
          (RULE_FILES.indexOf(f) + by + RULE_FILES.length) % RULE_FILES.length
        ]!,
    );
  };

  const inView = active.slice(0, 4);
  const year = years.includes(inView) ? inView : years[years.length - 1];
  const lastMonthOf = (y: string) =>
    months.filter((m) => m.startsWith(`${y}-`)).at(-1);

  const shortcuts: Shortcut[] = [
    {
      keys: ["1"],
      cap: "1",
      what: "Dashboard",
      run: () => changeView("dashboard"),
    },
    {
      keys: ["2"],
      cap: "2",
      what: "Transactions",
      run: () => changeView("transactions"),
    },
    {
      keys: ["3"],
      cap: "3",
      what: "Rules",
      run: () => changeView("rules"),
    },
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
      cap: "T",
      what: "Today — this month, or this year in a year view",
      run: () => {
        if (view === "rules") return;
        const now = todayOslo();
        const it = p.kind === "year" ? now.slice(0, 4) : now.slice(0, 7);
        if (offered.includes(it)) setChosen(it);
      },
    },
    { keys: ["a"], cap: "A", what: "All time", run: () => setChosen("all") },
    {
      keys: ["y"],
      cap: "Y",
      what: "The whole year — the latest, from all time",
      run: () => year && setChosen(year),
    },
    {
      keys: ["m"],
      cap: "M",
      what: "The last month of that year",
      run: () => {
        const m = year && lastMonthOf(year);
        if (m) setChosen(m);
      },
    },
    {
      keys: ["g"],
      cap: "G",
      what: "Next grain on the spending chart",
      run: () =>
        setChosenGrain(grains[(grains.indexOf(grain) + 1) % grains.length]!),
    },
    {
      keys: ["e"],
      cap: "E",
      what: "Show or hide excluded rows",
      run: () => setFilters((f) => ({ ...f, showExcluded: !f.showExcluded })),
    },
    {
      keys: ["r"],
      cap: "R",
      what: "Reset every filter",
      run: () => setFilters(NO_FILTERS),
    },
    {
      keys: ["c"],
      cap: "C",
      what: "Next theme",
      run: () => {
        const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
        onTheme(next);
        setTheme(next);
      },
    },
    {
      keys: ["R"],
      cap: "⇧R",
      what: "Refresh from the bank",
      run: () => {
        if (!refresh.busy) refresh.run();
      },
    },
    { cap: "/ ⌘F", what: "Search the transactions table" },
    {
      keys: ["?"],
      cap: "?",
      what: "This list",
      run: () => setHelp(true),
    },
  ];
  useShortcuts(shortcuts);

  const inPeriod = useMemo(
    () => txns.filter((t) => inRange(t, p.from, p.to)),
    [txns, p],
  );
  const categories = useMemo(
    () =>
      [
        ...new Set([
          ...distinctCategories(inPeriod),
          ...filters.categories.map((c) =>
            c.includes("/") ? c.slice(0, c.indexOf("/")) : c,
          ),
        ]),
      ].sort(),
    [inPeriod, filters.categories],
  );
  const subcategories = useMemo(
    () =>
      [
        ...new Set([
          ...distinctSubcategories(inPeriod),
          ...filters.categories.filter((c) => c.includes("/")),
        ]),
      ].sort(
        (a, b) =>
          a
            .slice(0, a.indexOf("/"))
            .localeCompare(b.slice(0, b.indexOf("/"))) ||
          subcategoryLabel(
            a.slice(0, a.indexOf("/")),
            a.slice(a.indexOf("/") + 1) || null,
          ).localeCompare(
            subcategoryLabel(
              b.slice(0, b.indexOf("/")),
              b.slice(b.indexOf("/") + 1) || null,
            ),
          ),
      ),
    [inPeriod, filters.categories],
  );
  const merchants = useMemo(
    () =>
      [...new Set([...distinctMerchants(inPeriod), ...filters.merchants])].sort(
        (a, b) => a.localeCompare(b),
      ),
    [inPeriod, filters.merchants],
  );
  const people = useMemo(() => personMerchants(inPeriod), [inPeriod]);
  const accounts = useMemo(
    () =>
      [...new Set([...distinctAccounts(inPeriod), ...filters.accounts])].sort(
        (a, b) => a.localeCompare(b),
      ),
    [inPeriod, filters.accounts],
  );
  const countries = useMemo(() => {
    const inView = distinctCountries(inPeriod);
    return inView.concat(filters.countries.filter((c) => !inView.includes(c)));
  }, [inPeriod, filters.countries]);

  return (
    <>
      {/* One bar holds the title, the three controls and every filter. It
          leaves on a scroll down and returns on a scroll up, so a phone reads
          the page at full height and reaches the filters without a scroll to
          the top. An open picker holds it, because a long list scrolls the page
          on at its end, and that would take the list off the screen. */}
      <header
        ref={header}
        className={`sticky top-0 z-30 border-b border-line bg-page transition-transform duration-200 has-[details[open]]:translate-y-0 motion-reduce:transition-none ${hidden ? "-translate-y-full" : ""}`}
      >
        <div className="mx-auto max-w-295 space-y-2.5 px-3 py-2.5 sm:px-6 sm:py-3">
          <Toolbar
            refresh={refresh}
            theme={theme}
            onTheme={onTheme}
            onHelp={() => setHelp(true)}
          />

          <FilterBar
            view={view}
            onView={changeView}
            tabs={
              <RuleTabs rules={rules} file={ruleFile} onFile={setRuleFile} />
            }
            months={months}
            years={years}
            period={active}
            kind={p.kind}
            from={p.from}
            to={p.to}
            earliest={record.from}
            latest={record.to}
            onPeriod={setChosen}
            categories={categories}
            subcategories={subcategories}
            merchants={merchants}
            people={people}
            accounts={accounts}
            countries={countries}
            filters={filters}
            onFilters={setFilters}
          />
        </div>
      </header>

      <ShortcutsDialog
        shortcuts={shortcuts}
        open={help}
        onClose={() => setHelp(false)}
      />

      <div className="mx-auto max-w-295 py-4 sm:px-6 sm:py-6">
        {/* The rules stand on their own. They are readable and editable before
            the first sync, so no load state gates them. */}
        {view === "rules" ? (
          <div className="px-3 sm:px-0">
            <RulesView
              rules={rules}
              txns={txns}
              pairs={pairs}
              file={ruleFile}
            />
          </div>
        ) : (
          <>
            <div className="px-3 sm:px-0">
              <LoadNote load={load} count={txns.length} refresh={refresh} />
            </div>
            {ready &&
              (view === "dashboard" ? (
                <div className="px-3 sm:px-0">
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
                </div>
              ) : (
                <TransactionsView
                  rows={inPeriod}
                  filters={filters}
                  onFilters={setFilters}
                  onFile={setFiling}
                />
              ))}
          </>
        )}
      </div>

      {filing && (
        <FileDialog
          txn={filing}
          rules={rules}
          txns={txns}
          pairs={pairs}
          onClose={() => setFiling(null)}
        />
      )}
      <Notifications>
        <Notification note={refresh.note} bad={refresh.bad} />
        <Notification note={rules.note} bad={rules.bad} />
      </Notifications>
    </>
  );
};
