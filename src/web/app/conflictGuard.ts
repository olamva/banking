import { useState } from "react";
import { newConflicts } from "../../core/narrowings.ts";
import {
  bulkRules,
  changeRules,
  groupRules,
  type RuleFile,
  type RuleMap,
} from "../../core/ruleFiles.ts";
import type { Categorized } from "../../core/types.ts";
import { CHECKED, type Conflict } from "./Checks.tsx";
import type { RulesApi } from "./data.ts";

export type PendingConflicts = {
  conflicts: Conflict[];
  keys: string[];
  others: string[];
  fixLater: () => void;
  removeOthers: () => void;
  cancel: () => void;
};

export const useConflictGuard = (rules: RulesApi, txns: Categorized[]) => {
  const [pending, setPending] = useState<PendingConflicts | null>(null);

  const guard = (
    file: RuleFile,
    keys: string[],
    change: (rules: RuleMap) => RuleMap,
    save: () => Promise<boolean>,
  ): Promise<boolean> => {
    const before = rules.data?.files[file];
    if (!CHECKED.some((f) => f === file) || !before || Array.isArray(before))
      return save();
    const conflicts = newConflicts(
      txns,
      before,
      change(before),
      file === "payees",
    ).map((c) => ({ ...c, file }));
    if (conflicts.length === 0) return save();
    const others = [
      ...new Set(conflicts.flatMap((c) => [c.winner, c.loser])),
    ].filter((key) => !keys.includes(key));
    return new Promise((settle) => {
      const close = (result: Promise<boolean> | boolean) => {
        setPending(null);
        settle(result);
      };
      setPending({
        conflicts,
        keys,
        others,
        fixLater: () => close(save()),
        removeOthers: () => {
          const saved = save();
          for (const key of others) void rules.remove(file, key);
          close(saved);
        },
        cancel: () => close(false),
      });
    });
  };

  const guarded: RulesApi = {
    ...rules,
    save: (file, key, value, was) =>
      guard(
        file,
        [key],
        (r) => changeRules(r, key, value, was) as RuleMap,
        () => rules.save(file, key, value, was),
      ),
    saveBulk: (file, keys, value) =>
      guard(
        file,
        keys,
        (r) => bulkRules(r, keys, value),
        () => rules.saveBulk(file, keys, value),
      ),
    saveGroup: (file, keys, value) =>
      guard(
        file,
        keys,
        (r) => groupRules(r, keys, value),
        () => rules.saveGroup(file, keys, value),
      ),
  };

  return { rules: guarded, pending };
};
