/**
 * The mobile rules a reader cannot check by looking at the page on a laptop: a
 * `minmax` floor and a missing viewport tag both render perfectly at every
 * width anyone developing this has open, and come apart only on the phone.
 */
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

// Both scans below are vacuous on an empty list, so a wrong path would pass.
test("the app's components are where this expects them", () => {
  assert.ok(tsx.length > 0, `no .tsx under ${APP}`);
});

test("every grid track floors at the viewport, not at a fixed width", () => {
  /**
   * `minmax(460px, 1fr)` is a *floor*: the column stays 460px wide on a 375px
   * phone and the page scrolls sideways under it. `minmax(min(460px, 100%), 1fr)`
   * asks for the same width and gives it up when there isn't room, which is the
   * only form allowed here.
   */
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
  /**
   * An absolutely-positioned panel defaults to the left edge of its trigger and
   * grows rightward. That is right for a control at the left of the bar and
   * wrong for one at the right: the filter summary sits under `ml-auto`, so 256px
   * of panel started at the last ~110px of the page and ran off it — on a desktop
   * window, not just a phone.
   *
   * The anchor depends on where the trigger sits, which is not visible from the
   * panel's own line, so the rule is that the line states it either way. `left-0`
   * is a no-op that documents the choice; a panel with neither is one where
   * nobody chose.
   */
  const anchored = /\b(left|right|inset-x)-/;
  const offending = tsx.flatMap((file) =>
    source(file)
      .split("\n")
      .flatMap((line, i) =>
        /className="absolute/.test(line) && !anchored.test(line)
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
  // Without this, mobile Safari lays the page out at 980px and scales it down:
  // every media query reads as desktop and the text arrives unreadably small.
  assert.match(
    source("index.html"),
    /<meta name="viewport" content="width=device-width/,
  );
});
