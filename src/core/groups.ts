import {
  axisPairs,
  emptyGroup,
  groupOf,
  NO_GROUP,
  type Filters,
  type Group,
} from "./select.ts";

const covers = (wide: Group, narrow: Group): boolean =>
  axisPairs().every(
    ([inn, out]) =>
      (!wide[inn].length ||
        (narrow[inn].length > 0 &&
          narrow[inn].every((v) => wide[inn].includes(v)))) &&
      wide[out].every((v) => narrow[out].includes(v)),
  );

export const dropNarrower = (f: Filters): Filters => {
  if (!f.or.length) return f;
  const groups = [f, ...f.or].map(groupOf).filter((g) => !emptyGroup(g));
  const kept = groups.filter(
    (g, i) =>
      !groups.some(
        (w, j) => j !== i && covers(w, g) && (j < i || !covers(g, w)),
      ),
  );
  const [first = NO_GROUP, ...rest] = kept;
  return { ...f, ...first, or: rest };
};
