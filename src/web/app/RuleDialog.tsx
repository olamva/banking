import { useMemo, useState } from "react";
import { haystackOf } from "../../core/match.ts";
import {
  CATEGORY_VALUED,
  isMapFile,
  type RuleFile,
} from "../../core/ruleFiles.ts";
import type { Categorized } from "../../core/types.ts";
import type { RulesApi } from "./data.ts";
import { BackIcon, Icon } from "./icons.ts";
import { RememberDialog } from "./Preferences.tsx";
import {
  CategoryInput,
  FIELD,
  MatchNote,
  PatternField,
  VALUE_LABEL,
} from "./RuleFields.tsx";
import { RULE_LABEL, RULE_NOTE } from "./ruleMeta.ts";
import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";

const suggestPattern = (t: Categorized): string =>
  (t.description.split(",")[0] ?? t.description).trim().toLowerCase();

export interface FileDialogProps {
  txn: Categorized;
  file: RuleFile;
  rules: RulesApi;
  txns: Categorized[];
  pairs: string[];
  onClose: () => void;
}

const PatternDialog = ({
  txn,
  file,
  rules,
  txns,
  pairs,
  onClose,
}: FileDialogProps) => {
  const [pattern, setPattern] = useState(() => suggestPattern(txn));
  const map = isMapFile(file);
  const [value, setValue] = useState(() => {
    if (CATEGORY_VALUED.has(file))
      return txn.subcategory
        ? `${txn.category}/${txn.subcategory}`
        : txn.category;
    if (file === "payees") return txn.counterparty ?? "";
    if (file === "countries") return txn.country ?? "";
    return "";
  });
  const haystacks = useMemo(() => txns.map(haystackOf), [txns]);
  const ready = pattern.trim() !== "" && (!map || value.trim() !== "");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
        <form
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            rules.save(file, pattern.trim(), map ? value.trim() : undefined);
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>{RULE_LABEL[file]}</DialogTitle>
            <DialogDescription className="text-xs">
              {RULE_NOTE[file]}
            </DialogDescription>
          </DialogHeader>

          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Pattern
            <PatternField
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className={`${FIELD} font-mono font-normal`}
            />
          </label>
          <MatchNote pattern={pattern} txns={txns} haystacks={haystacks} />

          {map && (
            <label className="flex flex-col gap-1.5 text-xs font-medium [&>div]:basis-auto">
              {VALUE_LABEL[file]}
              {CATEGORY_VALUED.has(file) ? (
                <CategoryInput
                  value={value}
                  pairs={pairs}
                  label={VALUE_LABEL[file]}
                  onChange={setValue}
                  className={`${FIELD} font-normal`}
                  dropUp
                />
              ) : (
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className={`${FIELD} font-normal`}
                />
              )}
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <Icon icon={BackIcon} size={14} />
              Back
            </Button>
            <Button type="submit" disabled={!ready}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const FileDialog = (props: FileDialogProps) =>
  props.file === "preferences" ? (
    <RememberDialog {...props} />
  ) : (
    <PatternDialog {...props} />
  );
