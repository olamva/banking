import { useState } from "react";
import { Modal } from "./Modal.tsx";
import { CURRENT_RELEASE, RELEASES } from "./releases.ts";

const releaseDate = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Oslo",
  }).format(new Date(`${date}T00:00:00Z`));

interface ReleaseNotesDialogProps {
  onClose: () => void;
}

const ReleaseNotesDialog = ({ onClose }: ReleaseNotesDialogProps) => (
  <Modal
    onClose={onClose}
    className="max-h-[min(80vh,42rem)] w-[min(90vw,32rem)] overflow-y-auto p-5 sm:p-6"
  >
    <h2 className="text-base font-semibold">Release notes</h2>
    <p className="mt-1 text-xs text-ink-muted">
      Important new features and major changes.
    </p>
    <div className="mt-5 space-y-6">
      {RELEASES.map((release, index) => (
        <section
          key={release.version}
          aria-labelledby={`release-${release.version}`}
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3
              id={`release-${release.version}`}
              className="text-sm font-semibold"
            >
              Version {release.version}
            </h3>
            {index === 0 && (
              <span className="rounded-full bg-series-1-track px-2 py-0.5 text-[10px] font-medium text-series-1">
                Current
              </span>
            )}
            <time
              dateTime={release.date}
              className="ml-auto text-xs text-ink-muted"
            >
              {releaseDate(release.date)}
            </time>
          </div>
          <ul className="mt-3 space-y-3">
            {release.highlights.map((highlight) => (
              <li key={highlight.title}>
                <p className="text-[13px] font-medium">{highlight.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                  {highlight.detail}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
    <button
      type="button"
      onClick={onClose}
      className="mt-6 w-full rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted"
    >
      Close
    </button>
  </Modal>
);

export const ReleaseFooter = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <footer className="mx-auto flex max-w-295 justify-center px-3 pb-6 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-ink-muted hover:text-ink-soft hover:underline"
        >
          Version {CURRENT_RELEASE.version} · Release notes
        </button>
      </footer>
      {open && <ReleaseNotesDialog onClose={() => setOpen(false)} />}
    </>
  );
};
