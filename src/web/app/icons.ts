import { createElement } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

export type { IconSvgElement } from "@hugeicons/react";

// Decorative unless a caller says otherwise. Every icon on this page sits
// beside its own text, so `aria-hidden` was on all but one of them.
export const Icon = (props: React.ComponentProps<typeof HugeiconsIcon>) =>
  createElement(HugeiconsIcon, { "aria-hidden": true, ...props });

export { default as DownIcon } from "@hugeicons/core-free-icons/ArrowDown02Icon";
export { default as FlatIcon } from "@hugeicons/core-free-icons/ArrowRight02Icon";
export { default as UpIcon } from "@hugeicons/core-free-icons/ArrowUp02Icon";

export { default as SortDescIcon } from "@hugeicons/core-free-icons/ArrowDown01Icon";
export { default as SortAscIcon } from "@hugeicons/core-free-icons/ArrowUp01Icon";
export { default as SortableIcon } from "@hugeicons/core-free-icons/ArrowUpDownIcon";

export { default as DropdownIcon } from "@hugeicons/core-free-icons/ArrowDown01Icon";
export { default as CloseIcon } from "@hugeicons/core-free-icons/Cancel01Icon";
export { default as BackIcon } from "@hugeicons/core-free-icons/ArrowLeft02Icon";
export { default as EditIcon } from "@hugeicons/core-free-icons/Edit02Icon";
export { default as ResetFiltersIcon } from "@hugeicons/core-free-icons/FilterResetIcon";
export { default as KeyboardIcon } from "@hugeicons/core-free-icons/KeyboardIcon";
export { default as RefreshIcon } from "@hugeicons/core-free-icons/RefreshIcon";
export { default as SearchIcon } from "@hugeicons/core-free-icons/Search01Icon";
export { default as ExpandIcon } from "@hugeicons/core-free-icons/ArrowRight01Icon";
export { default as SystemThemeIcon } from "@hugeicons/core-free-icons/ComputerIcon";
export { default as DarkThemeIcon } from "@hugeicons/core-free-icons/Moon02Icon";
export { default as LightThemeIcon } from "@hugeicons/core-free-icons/Sun03Icon";

export { default as MonthlyIcon } from "@hugeicons/core-free-icons/ChartColumnIcon";
export { default as ChangesIcon } from "@hugeicons/core-free-icons/ChartIncreaseIcon";
export { default as TransactionsIcon } from "@hugeicons/core-free-icons/Invoice01Icon";
export { default as CategoryIcon } from "@hugeicons/core-free-icons/PieChartIcon";
export { default as RecurringIcon } from "@hugeicons/core-free-icons/RepeatIcon";
export { default as CounterpartyIcon } from "@hugeicons/core-free-icons/Store01Icon";
export { default as AccountIcon } from "@hugeicons/core-free-icons/Wallet01Icon";

export { default as UndoIcon } from "@hugeicons/core-free-icons/Undo02Icon";
export { default as RedoIcon } from "@hugeicons/core-free-icons/Redo02Icon";
export { default as GoToVersionIcon } from "@hugeicons/core-free-icons/HistoryIcon";
export { default as AddedIcon } from "@hugeicons/core-free-icons/PlusSignIcon";
export { default as RemovedIcon } from "@hugeicons/core-free-icons/MinusSignIcon";
export { default as ChangedIcon } from "@hugeicons/core-free-icons/Exchange01Icon";

export { default as ErrorIcon } from "@hugeicons/core-free-icons/AlertCircleIcon";
export { default as InfoIcon } from "@hugeicons/core-free-icons/InformationCircleIcon";
export { default as LoadingIcon } from "@hugeicons/core-free-icons/Loading03Icon";
