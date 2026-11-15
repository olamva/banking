import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.tsx";

interface ChoiceToggleProps<T extends string> {
  value: T;
  offered: T[];
  labels: Record<T, string>;
  name: string;
  onChange: (value: T) => void;
}

export const ChoiceToggle = <T extends string>({
  value,
  offered,
  labels,
  name,
  onChange,
}: ChoiceToggleProps<T>) =>
  offered.length < 2 ? null : (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={name}
    >
      {offered.map((v) => (
        <ToggleGroupItem key={v} value={v} className="px-2 text-xs">
          {labels[v]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
