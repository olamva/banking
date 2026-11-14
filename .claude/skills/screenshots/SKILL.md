---
name: screenshots
description: Capture screenshots of the banking web app for visual review and before and after states. Use whenever you need to see, check, or show the UI, at phone or desktop size, in dark or light mode.
---

# Screenshots

Use `pnpm shot` for every screenshot of the web app.
Do not use the T3 preview tools. Do not ask the user to open a dev server.

## Capture

```sh
pnpm shot '/?view=transactions&p=all' --before origin/main
```

- The command starts its own Vite server on a free port and stops it at the end. You do not need `pnpm dev`.
- `--before <ref>` also captures the ref from a temporary checkout under `/tmp`. The command removes the checkout at the end.
- The command prints one PNG path for each capture. The default directory is `~/.t3/userdata/attachments/<branch>`.
- The file name is `<path>-<size>-[before|after]-<theme>.png`.
- The command waits for the network and the fonts. Do not add fixed sleeps.
- A step fails after 10 seconds. Correct the selector and run the command again.

| Option                       | Effect                                                               |
| ---------------------------- | -------------------------------------------------------------------- |
| `--theme dark\|light\|both`  | Color scheme. The default is `both`.                                 |
| `--size phone\|desktop\|WxH` | Viewport. `phone` is 375×812 with touch, and the default. `desktop` is 1440×900. |
| `--click <selector>`         | Click a visible element. Repeat it for more steps.                   |
| `--type <text>`              | Type into the focused element after the clicks.                      |
| `--wait <selector>`          | Wait for a visible element.                                          |
| `--element <selector>`       | Capture one element.                                                 |
| `--full`                     | Capture the full page.                                               |
| `--out <dir>`                | Output directory.                                                    |

Use Playwright selectors: CSS, `text=Categories`, or `role=button[name="Categories"]`.

## Show the images

- Read each image before you report a match. Compare the before and after images.
- Embed the images in your reply in the T3 thread with their absolute paths.
- Never upload a screenshot to GitHub, a PR, or any other service. The repository is public, and each screenshot shows real transactions.
