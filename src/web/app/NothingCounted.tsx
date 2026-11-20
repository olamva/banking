import { plural } from "../../core/plural.ts";
import { totals } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import { Empty } from "./Cards.tsx";
import { Button } from "./ui/button.tsx";

interface NothingCountedProps {
  rows: Categorized[];
  onTransactions: () => void;
}

export const NothingCounted = ({
  rows,
  onTransactions,
}: NothingCountedProps) => {
  const { count } = totals(rows).excluded;
  return (
    <Empty>
      {count === 0 ? (
        "No transactions match the current filters."
      ) : (
        <>
          {plural(count, "transfer")}, not counted.{" "}
          <Button
            variant="link"
            className="h-auto p-0 text-[length:inherit]"
            onClick={onTransactions}
          >
            Show transactions
          </Button>
        </>
      )}
    </Empty>
  );
};
