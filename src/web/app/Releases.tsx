import { AREAS, KINDS, type Kind } from "./releaseNotes.ts";
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
    month: "short",
    year: "numeric",
    timeZone: "Europe/Oslo",
  }).format(new Date(`${date}T00:00:00Z`));

const KIND_VARIANT: Record<Kind, "default" | "secondary" | "outline"> = {
  new: "default",
  improved: "secondary",
  fixed: "outline",
};

interface ReleaseNotesDialogProps {
  open: boolean;
  onClose: () => void;
}

export const ReleaseNotesDialog = ({
  open,
  onClose,
}: ReleaseNotesDialogProps) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-h-[min(85dvh,48rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Release notes</DialogTitle>
        <DialogDescription>
          Important new features and major changes.
        </DialogDescription>
      </DialogHeader>
      <div className="divide-y">
        {RELEASES.map((release, index) => (
          <section
            key={release.version}
            aria-labelledby={`release-${release.version}`}
            className="grid gap-3 py-5 first:pt-1 last:pb-0 sm:grid-cols-[7.5rem_1fr] sm:gap-6"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-col sm:items-start">
              <h3
                id={`release-${release.version}`}
                className="text-lg leading-none font-semibold tabular-nums"
              >
                {release.version}
              </h3>
              <time
                dateTime={release.date}
                className="text-xs text-muted-foreground max-sm:order-last max-sm:ml-auto"
              >
                {releaseDate(release.date)}
              </time>
              {(index === 0 || release.bump === "major") && (
                <span className="flex gap-1">
                  {index === 0 && <Badge variant="secondary">Current</Badge>}
                  {release.bump === "major" && (
                    <Badge variant="outline">Major</Badge>
                  )}
                </span>
              )}
            </div>
            <ul className="space-y-3">
              {release.highlights.map((highlight) => (
                <li key={highlight.title}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-medium">{highlight.title}</p>
                    <span className="flex gap-1">
                      <Badge variant={KIND_VARIANT[highlight.kind]}>
                        {KINDS[highlight.kind]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        {AREAS[highlight.area]}
                      </Badge>
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-muted-foreground">
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
