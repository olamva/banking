import { createElement } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

export type { IconSvgElement } from "@hugeicons/react";

// Decorative unless a caller says otherwise. Every icon on this page sits
// beside its own text, so `aria-hidden` was on all but one of them.
export const Icon = (props: React.ComponentProps<typeof HugeiconsIcon>) =>
  createElement(HugeiconsIcon, { "aria-hidden": true, ...props });

export { ArrowDown02Icon as DownIcon } from "@hugeicons/core-free-icons";
export { ArrowRight02Icon as FlatIcon } from "@hugeicons/core-free-icons";
export { ArrowUp02Icon as UpIcon } from "@hugeicons/core-free-icons";

export { ArrowDown01Icon as SortDescIcon } from "@hugeicons/core-free-icons";
export { ArrowUp01Icon as SortAscIcon } from "@hugeicons/core-free-icons";
export { ArrowUpDownIcon as SortableIcon } from "@hugeicons/core-free-icons";

export { ArrowDown01Icon as DropdownIcon } from "@hugeicons/core-free-icons";
export { Cancel01Icon as CloseIcon } from "@hugeicons/core-free-icons";
export { ArrowLeft02Icon as BackIcon } from "@hugeicons/core-free-icons";
export { Edit02Icon as EditIcon } from "@hugeicons/core-free-icons";
export { FilterResetIcon as ResetFiltersIcon } from "@hugeicons/core-free-icons";
export { KeyboardIcon as KeyboardIcon } from "@hugeicons/core-free-icons";
export { RefreshIcon as RefreshIcon } from "@hugeicons/core-free-icons";
export { Search01Icon as SearchIcon } from "@hugeicons/core-free-icons";
export { ArrowRight01Icon as ExpandIcon } from "@hugeicons/core-free-icons";
export { ComputerIcon as SystemThemeIcon } from "@hugeicons/core-free-icons";
export { Moon02Icon as DarkThemeIcon } from "@hugeicons/core-free-icons";
export { Sun03Icon as LightThemeIcon } from "@hugeicons/core-free-icons";

export { ChartColumnIcon as MonthlyIcon } from "@hugeicons/core-free-icons";
export { ChartIncreaseIcon as ChangesIcon } from "@hugeicons/core-free-icons";
export { Invoice01Icon as TransactionsIcon } from "@hugeicons/core-free-icons";
export { PieChartIcon as CategoryIcon } from "@hugeicons/core-free-icons";
export { RepeatIcon as RecurringIcon } from "@hugeicons/core-free-icons";
export { Store01Icon as CounterpartyIcon } from "@hugeicons/core-free-icons";
export { Wallet01Icon as AccountIcon } from "@hugeicons/core-free-icons";

export { Undo02Icon as UndoIcon } from "@hugeicons/core-free-icons";
export { Redo02Icon as RedoIcon } from "@hugeicons/core-free-icons";
export { HistoryIcon as GoToVersionIcon } from "@hugeicons/core-free-icons";
export { PlusSignIcon as AddedIcon } from "@hugeicons/core-free-icons";
export { MinusSignIcon as RemovedIcon } from "@hugeicons/core-free-icons";
export { Exchange01Icon as ChangedIcon } from "@hugeicons/core-free-icons";

export { AlertCircleIcon as ErrorIcon } from "@hugeicons/core-free-icons";
export { InformationCircleIcon as InfoIcon } from "@hugeicons/core-free-icons";
export { Loading03Icon as LoadingIcon } from "@hugeicons/core-free-icons";
