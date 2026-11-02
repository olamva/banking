import type { ReactNode, RefObject } from "react";
import type { Load, Refresh } from "./data.ts";
import { ErrorIcon, Icon, LoadingIcon, RefreshIcon } from "./icons.ts";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardHeader } from "./ui/card.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty.tsx";
import { Separator } from "./ui/separator.tsx";
import { SidebarTrigger } from "./ui/sidebar.tsx";
import { Skeleton } from "./ui/skeleton.tsx";
import { cn } from "./ui/utils.ts";

export const RefreshButton = ({ refresh }: { refresh: Refresh }) => (
  <Button
    variant="outline"
    onClick={refresh.run}
    disabled={refresh.busy}
    aria-label="Refresh from the bank"
  >
    <Icon
      icon={refresh.busy ? LoadingIcon : RefreshIcon}
      size={15}
      className={refresh.busy ? "animate-spin" : undefined}
    />
    <span className={cn("max-sm:hidden", refresh.busy && "glow")}>
      {refresh.busy ? "Refreshing…" : "Refresh"}
    </span>
  </Button>
);

interface HeaderProps {
  ref: RefObject<HTMLElement | null>;
  hidden: boolean;
  title: string;
  controls?: ReactNode;
  action: ReactNode;
  children?: ReactNode;
}

export const Header = ({
  ref,
  hidden,
  title,
  controls,
  action,
  children,
}: HeaderProps) => (
  <header
    ref={ref}
    className={cn(
      "sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md transition-transform duration-200 has-[[data-state=open]]:translate-y-0 motion-reduce:transition-none supports-backdrop-filter:bg-background/75",
      hidden && "-translate-y-full",
    )}
  >
    <div className="mx-auto flex max-w-7xl flex-col gap-2.5 px-3 py-2.5 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-1 h-4! self-center max-sm:hidden"
        />
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:flex-none">
          {title}
        </h1>
        <div className="flex min-w-0 items-center gap-2 max-sm:order-last max-sm:w-full sm:ml-2">
          {controls}
        </div>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </div>
  </header>
);

const TileSkeleton = () => (
  <Card size="sm">
    <CardHeader className="gap-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-32" />
    </CardHeader>
  </Card>
);

const PanelSkeleton = ({ height }: { height: string }) => (
  <Card>
    <CardHeader>
      <Skeleton className="h-4 w-40" />
    </CardHeader>
    <CardContent>
      <Skeleton className={cn("w-full", height)} />
    </CardContent>
  </Card>
);

const PageSkeleton = () => (
  <div aria-busy="true" aria-label="Loading" className="space-y-4">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <TileSkeleton />
      <TileSkeleton />
      <TileSkeleton />
    </div>
    <PanelSkeleton height="h-56" />
    <div className="grid gap-4 md:grid-cols-2">
      <PanelSkeleton height="h-48" />
      <PanelSkeleton height="h-48" />
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
  if (load.status === "loading") return <PageSkeleton />;
  if (load.status === "error")
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon icon={ErrorIcon} className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle>Could not load transactions</EmptyTitle>
          <EmptyDescription>{load.message}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  if (count === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon icon={RefreshIcon} />
          </EmptyMedia>
          <EmptyTitle>No transactions yet</EmptyTitle>
          <EmptyDescription>
            Press Refresh to fetch them from the bank.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <RefreshButton refresh={refresh} />
        </EmptyContent>
      </Empty>
    );
  return null;
};
