import { plural } from "../../core/plural.ts";
import type { ExcludedSummary } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import { Empty, InfoTip } from "./Cards.tsx";
import { fmtNOK } from "./format.ts";
import { Button } from "./ui/button.tsx";

interface ExcludedInfoProps {
  excluded: ExcludedSummary;
  shown: boolean;
}

export const ExcludedInfo = ({ excluded, shown }: ExcludedInfoProps) =>
  shown || excluded.count === 0 ? null : (
    <InfoTip label="About internal transfers" className="-my-1">
      {plural(excluded.count, "transaction")} for {fmtNOK(excluded.total)} in
      this period are internal transfers or card bill payments. They are not
      counted. Turn on Show internal transfers in Filter to see them.
    </InfoTip>
  );

interface NothingCountedProps {
  rows: Categorized[];
  onTransactions: () => void;
}

export const NothingCounted = ({
  rows,
  onTransactions,
}: NothingCountedProps) => (
  <Empty>
    {plural(rows.length, "transfer")}, not counted.{" "}
    <Button
      variant="link"
      className="h-auto p-0 text-[length:inherit]"
      onClick={onTransactions}
    >
      Show transactions
    </Button>
  </Empty>
);
