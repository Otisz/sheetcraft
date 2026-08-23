import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CharacterRecord, Modifier } from "@/features/dnd/db/schema";
import type { Derived } from "@/features/dnd/derive";
import { BioTab } from "@/features/dnd/play/bio-tab";
import { CombatTab } from "@/features/dnd/play/combat-tab";
import { FeaturesTab } from "@/features/dnd/play/features-tab";
import { InventoryTab } from "@/features/dnd/play/inventory-tab";
import { useTabData } from "@/features/dnd/play/queries";
import { spellSection } from "@/features/dnd/play/sections";
import { SkillsTab } from "@/features/dnd/play/skills-tab";
import { SpellsTab } from "@/features/dnd/play/spells-tab";
import { SHEET_TABS } from "@/features/dnd/play/tabs";

/**
 * The six tabs, below the always-visible header.
 *
 * **The bar scrolls, the page does not.** Six labels do not fit across a narrow
 * phone, so the list itself is the horizontally scrollable thing — `overflow-x`
 * on the list with `min-w-0` on its parent, which is what keeps the page body
 * from scrolling sideways. A page that pans horizontally is the failure this
 * layout exists to avoid; see the acceptance criteria on #164.
 *
 * Every tab renders from the same `derived` the header does. The panels are
 * mounted lazily by Base UI, so the eighteen skill rows cost nothing until the
 * Skills tab is opened.
 */
export function SheetTabs({
  character,
  derived,
  names,
  onPlayChange,
  onModifiersChange,
}: {
  character: CharacterRecord;
  derived: Derived;
  /** Resolved display names, queried by the sheet and shared with the header. */
  names: Partial<Record<string, string>>;
  onPlayChange: (play: Partial<CharacterRecord["play"]>) => void;
  /** Writes the modifier list — how the tabs create and clear overrides. See ADR-0005. */
  onModifiersChange: (modifiers: Modifier[]) => void;
}) {
  // The feature prose arrives after first paint on purpose — see `tab-data.ts`.
  // Until it does, refs render through the same `⚠ unknown` path a dangling ref
  // takes, which is honest: the app does not know the name yet.
  const tabData = useTabData(character);

  const section = spellSection({
    className: names[character.classRef] ?? null,
    slots: derived.spellSlots,
    cantripsKnown: derived.cantripsKnown,
    known: character.spells.known,
    prepared: character.spells.prepared,
  });

  return (
    <Tabs defaultValue="skills" className="min-w-0">
      {/*
        `-mx-4 px-4` lets the scrolling list bleed to the screen edges while the
        rest of the sheet keeps its gutter, so a swipe that starts at the edge
        still moves the bar.
      */}
      <div className="-mx-4 overflow-x-auto px-4">
        <TabsList variant="line" className="w-max">
          {SHEET_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="px-3">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="skills">
        <SkillsTab character={character} derived={derived} onModifiersChange={onModifiersChange} />
      </TabsContent>

      <TabsContent value="combat">
        <CombatTab
          character={character}
          derived={derived}
          onPlayChange={onPlayChange}
          onModifiersChange={onModifiersChange}
        />
      </TabsContent>

      <TabsContent value="spells">
        <SpellsTab
          section={section}
          derived={derived}
          names={names}
          modifiers={character.modifiers}
          onModifiersChange={onModifiersChange}
          onSlotsChange={(level, expended) =>
            onPlayChange({ slotsExpended: { ...character.play.slotsExpended, [level]: expended } })
          }
        />
      </TabsContent>

      <TabsContent value="features">
        <FeaturesTab
          classFeatures={tabData.data?.classFeatures ?? []}
          raceFeatures={tabData.data?.raceFeatures ?? []}
        />
      </TabsContent>

      <TabsContent value="inventory">
        <InventoryTab character={character} names={names} onCurrencyChange={(currency) => onPlayChange({ currency })} />
      </TabsContent>

      <TabsContent value="bio">
        <BioTab character={character} names={names} onNotesChange={(notes) => onPlayChange({ notes })} />
      </TabsContent>
    </Tabs>
  );
}
