/**
 * Hugeicons, imported one module per icon on purpose.
 *
 * The package's own barrel (`@hugeicons/core-free-icons`) is a single 6 MB
 * file, and there is no build step here to tree-shake it — `pnpm dev` would
 * ship the whole free set to the browser. Each subpath import below is one
 * small module, so the page only ever loads the icons named here.
 *
 * Everything re-exports through this file so the component files stay free of
 * package paths, and so adding an icon is one line in one place.
 */
export { HugeiconsIcon as Icon } from '@hugeicons/react';
export type { IconSvgElement } from '@hugeicons/react';

// Deltas on a stat tile: up, down, unchanged.
export { default as UpIcon } from '@hugeicons/core-free-icons/ArrowUp02Icon';
export { default as DownIcon } from '@hugeicons/core-free-icons/ArrowDown02Icon';
export { default as FlatIcon } from '@hugeicons/core-free-icons/ArrowRight02Icon';

// Sortable table headers.
export { default as SortAscIcon } from '@hugeicons/core-free-icons/ArrowUp01Icon';
export { default as SortDescIcon } from '@hugeicons/core-free-icons/ArrowDown01Icon';
export { default as SortableIcon } from '@hugeicons/core-free-icons/ArrowUpDownIcon';

// Controls.
export { default as SearchIcon } from '@hugeicons/core-free-icons/Search01Icon';
export { default as ResetFiltersIcon } from '@hugeicons/core-free-icons/FilterResetIcon';
// One per theme option — "system" is the machine, not whichever way it resolved.
export { default as SystemThemeIcon } from '@hugeicons/core-free-icons/ComputerIcon';
export { default as LightThemeIcon } from '@hugeicons/core-free-icons/Sun03Icon';
export { default as DarkThemeIcon } from '@hugeicons/core-free-icons/Moon02Icon';

// Card headings.
export { default as CategoryIcon } from '@hugeicons/core-free-icons/PieChartIcon';
export { default as ChangesIcon } from '@hugeicons/core-free-icons/ChartIncreaseIcon';
export { default as CounterpartyIcon } from '@hugeicons/core-free-icons/Store01Icon';
export { default as RecurringIcon } from '@hugeicons/core-free-icons/RepeatIcon';
export { default as MonthlyIcon } from '@hugeicons/core-free-icons/ChartColumnIcon';
export { default as TransactionsIcon } from '@hugeicons/core-free-icons/Invoice01Icon';

// Page states and notes.
export { default as LoadingIcon } from '@hugeicons/core-free-icons/Loading03Icon';
export { default as ErrorIcon } from '@hugeicons/core-free-icons/AlertCircleIcon';
export { default as InfoIcon } from '@hugeicons/core-free-icons/InformationCircleIcon';
