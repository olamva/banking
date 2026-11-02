import { CURRENT_RELEASE, RELEASES } from "./releases.ts";
import { Badge } from "./ui/badge.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";

export { CURRENT_RELEASE };

const releaseDate = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Oslo",
  }).format(new Date(`${date}T00:00:00Z`));

interface ReleaseNotesDialogProps {
  open: boolean;
  onClose: () => void;
}

export const ReleaseNotesDialog = ({
  open,
  onClose,
}: ReleaseNotesDialogProps) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-h-[min(85dvh,42rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Release notes</DialogTitle>
        <DialogDescription>
          Important new features and major changes.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-6">
        {RELEASES.map((release, index) => (
          <section
            key={release.version}
            aria-labelledby={`release-${release.version}`}
          >
            <div className="flex flex-wrap items-center gap-x-2">
              <h3
                id={`release-${release.version}`}
                className="text-sm font-semibold"
              >
                Version {release.version}
              </h3>
              {index === 0 && <Badge variant="secondary">Current</Badge>}
              <time
                dateTime={release.date}
                className="ml-auto text-xs text-muted-foreground"
              >
                {releaseDate(release.date)}
              </time>
            </div>
            <ul className="mt-3 space-y-3">
              {release.highlights.map((highlight) => (
                <li key={highlight.title}>
                  <p className="text-[13px] font-medium">{highlight.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {highlight.detail}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DialogContent>
  </Dialog>
);
