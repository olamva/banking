import { BUTTON, Loading } from "./Cards.tsx";
import {
  THEMES,
  setTheme,
  type Load,
  type Refresh,
  type Theme,
} from "./data.ts";
import {
  DarkThemeIcon,
  ErrorIcon,
  Icon,
  KeyboardIcon,
  LightThemeIcon,
  LoadingIcon,
  RefreshIcon,
  SystemThemeIcon,
} from "./icons.ts";

const THEME_ICONS = {
  system: SystemThemeIcon,
  light: LightThemeIcon,
  dark: DarkThemeIcon,
};

interface RefreshButtonProps {
  refresh: Refresh;
}

const RefreshButton = ({ refresh }: RefreshButtonProps) => (
  <button
    type="button"
    onClick={refresh.run}
    disabled={refresh.busy}
    aria-label="Refresh from the bank"
    className={`${BUTTON} flex items-center gap-1.5`}
  >
    <Icon
      icon={refresh.busy ? LoadingIcon : RefreshIcon}
      size={14}
      className={refresh.busy ? "animate-spin" : undefined}
    />
    <span className={refresh.busy ? "glow max-sm:hidden" : "max-sm:hidden"}>
      {refresh.busy ? "Refreshing…" : "Refresh"}
    </span>
  </button>
);

interface ToolbarProps {
  refresh: Refresh;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onHelp: () => void;
}

export const Toolbar = ({ refresh, theme, onTheme, onHelp }: ToolbarProps) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-1 gap-y-2 sm:gap-x-4">
    <h1 className="text-base font-semibold sm:text-xl">Spending dashboard</h1>
    {/* Keep the controls on the title line at phone widths. */}
    <div className="flex flex-wrap items-center gap-2">
      {/* The one control on this page that costs a bank request. It syncs
          the whole record with --force, then rebuilds the database. */}
      <RefreshButton refresh={refresh} />
      <button
        type="button"
        onClick={onHelp}
        aria-label="Keyboard shortcuts"
        className={`${BUTTON} flex items-center gap-1.5`}
      >
        <Icon icon={KeyboardIcon} size={14} />
        <span className="max-sm:hidden">Shortcuts</span>
      </button>
      {/* Three named options rather than a cycling button: a toggle whose next
          state you cannot see is a toggle you press twice. The icon names the
          option picked — "system" is the machine, not the way it resolved. */}
      <div className="relative">
        <Icon
          icon={THEME_ICONS[theme]}
          size={14}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-soft"
        />
        <select
          className="h-7.5 appearance-none rounded-md border border-line bg-surface pr-3 pl-8 text-xs text-ink-soft"
          value={theme}
          onChange={(e) => {
            const next = e.target.value as Theme;
            onTheme(next);
            setTheme(next);
          }}
          aria-label="Theme"
        >
          {/* Capitalised here, not in CSS — a native select menu ignores text-transform. */}
          {THEMES.map((t) => (
            <option key={t} value={t}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </div>
  </div>
);

export const LoadNote = ({
  load,
  count,
  refresh,
}: {
  load: Load;
  count: number;
  refresh: Refresh;
}) => {
  if (load.status === "loading") return <Loading />;
  if (load.status === "error")
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-critical">
        <Icon icon={ErrorIcon} size={16} className="shrink-0" />
        Could not load transactions: {load.message}
      </div>
    );
  if (count === 0)
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center text-ink-muted">
        No transactions yet — press Refresh.
        <RefreshButton refresh={refresh} />
      </div>
    );
  return null;
};
