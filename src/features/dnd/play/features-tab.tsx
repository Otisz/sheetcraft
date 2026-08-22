import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { FeatureEntry } from "@/features/dnd/play/tab-data";

/**
 * The Features tab: class features, then race traits, each expandable.
 *
 * The prose is collapsed by default and expands in place. A feature is several
 * paragraphs of rulebook text, and eight of them expanded at once is a wall
 * nobody reads on a phone — but the text has to be *here* rather than behind a
 * link, because "what does Rage actually do" is a mid-combat question.
 *
 * Features are **prose only**. Anything a feature does to a number arrives as a
 * modifier record and appears on the effects row instead; this tab never
 * implies arithmetic the app did not do.
 */
export function FeaturesTab({
  classFeatures,
  raceFeatures,
}: {
  classFeatures: FeatureEntry[];
  raceFeatures: FeatureEntry[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <FeatureGroup label="Class features" features={classFeatures} emptyMessage="No class features at this level." />
      <FeatureGroup label="Race traits" features={raceFeatures} emptyMessage="This race grants no traits." />
    </div>
  );
}

function FeatureGroup({
  label,
  features,
  emptyMessage,
}: {
  label: string;
  features: FeatureEntry[];
  emptyMessage: string;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{label}</h2>

      {features.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {features.map((feature) => (
            <li key={feature.index}>
              <Feature feature={feature} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Feature({ feature }: { feature: FeatureEntry }) {
  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{feature.name}</span>
        {feature.level === undefined ? null : (
          <span className="shrink-0 text-[0.7rem] text-muted-foreground">Level {feature.level}</span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="px-3 pb-3">
        {feature.description.length === 0 ? (
          <p className="text-sm text-muted-foreground">No description in the SRD.</p>
        ) : (
          feature.description.map((paragraph) => (
            <p key={paragraph} className="mt-2 text-sm leading-relaxed text-muted-foreground first:mt-0">
              {paragraph}
            </p>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
