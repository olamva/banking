/**
 * The two mobile rules a reader cannot check by looking at the page on a laptop.
 *
 * Everything else about the layout is judged by eye at a narrow window, which is
 * fine — it fails visibly. These two do not: a `minmax` floor and a missing
 * viewport tag both render perfectly at every width anyone developing this has
 * open, and only come apart on the phone nobody is testing on. So they get the
 * check, and the rest of the mobile rules stay prose in CLAUDE.md.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const source = (name: string) => readFileSync(join(HERE, name), "utf8");

const tsx = readdirSync(HERE).filter((f) => f.endsWith(".tsx"));

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

test("the page declares the device width", () => {
  // Without this, mobile Safari lays the page out at 980px and scales it down:
  // every media query reads as desktop and the text arrives unreadably small.
  assert.match(
    source("index.html"),
    /<meta name="viewport" content="width=device-width/,
  );
});
