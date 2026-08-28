import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const APP = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../src/web/app",
);

const source = (name: string) => readFileSync(join(APP, name), "utf8");

const tsx = readdirSync(APP).filter((f) => f.endsWith(".tsx"));

test("the app's components are where this expects them", () => {
  assert.ok(tsx.length > 0, `no .tsx under ${APP}`);
});

test("every grid track floors at the viewport, not at a fixed width", () => {
  const bare = /minmax\(\s*\d/;
  for (const file of tsx) {
    const offending = source(file)
      .split("\n")
      .flatMap((line, i) =>
        bare.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [],
      );
    assert.deepEqual(
      offending,
      [],
      `a grid track floors at a fixed width — wrap it as minmax(min(Npx,100%),1fr):\n${offending.join("\n")}`,
    );
  }
});

test("every floating panel says which edge it hangs from", () => {
  const anchored = /\b(left|right|inset-x)-/;
  // Both spellings. A panel that picks its edge needs a template literal, and
  // that is the one most able to get the edge wrong.
  const panel = /className=(?:"|\{`)absolute/;
  const offending = tsx.flatMap((file) =>
    source(file)
      .split("\n")
      .flatMap((line, i) =>
        panel.test(line) && !anchored.test(line)
          ? [`${file}:${i + 1}: ${line.trim()}`]
          : [],
      ),
  );
  assert.deepEqual(
    offending,
    [],
    `a floating panel does not say which edge it hangs from — add left-0 or right-0:\n${offending.join("\n")}`,
  );
});

test("the page declares the device width", () => {
  assert.match(
    source("index.html"),
    /<meta name="viewport" content="width=device-width/,
  );
});
