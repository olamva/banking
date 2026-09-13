# Preview action

## Goal

Add a T3 Code action that opens the transactions preview at the known local URL.

## Established facts

- The T3 schema supports `previewUrl` and `autoOpenPreview` for project scripts.
- T3 opens project script previews in the desktop in-app browser.
- The schema accepts only a static URL. It provides no latest-agent-link variable.

## Open decisions

## Dead ends

- Official OpenAI documentation does not document T3 Code project actions.
- The sandbox blocked direct DNS access to the T3 schema.
