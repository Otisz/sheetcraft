import { PickerField } from "@/features/dnd/creation/picker-field";
import { useClassOptions, useRaceOptions } from "@/features/dnd/creation/queries";
import { ABILITIES, type Abil } from "@/features/dnd/db/schema";
import type { FormDraft } from "@/features/dnd/homebrew/drafts";
import { FieldSection, SwitchField, TextAreaField, TextField } from "@/features/dnd/homebrew/fields";
import type { HomebrewType } from "@/features/dnd/homebrew/types";

/**
 * The field-by-field surface, for the four types shallow enough to have one
 * plus the deliberately partial subclass form.
 *
 * Every form writes into the SAME `FormDraft` and every one of them is turned
 * into an entry by `buildCandidate` — so a field added here without a builder
 * change simply does not save, rather than saving something the schema
 * rejects at the last moment.
 *
 * There are NO balance warnings anywhere in here. Schema-valid is valid;
 * mechanical sanity is the table's business.
 */

export type EntryFormProps = {
  type: HomebrewType;
  draft: FormDraft;
  onChange: (draft: FormDraft) => void;
};

export function EntryForm({ type, draft, onChange }: EntryFormProps) {
  /** One field at a time, so no caller has to spread the draft itself. */
  const set = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) => onChange({ ...draft, [key]: value });

  return (
    <div className="flex flex-col gap-8">
      <FieldSection title="Identity">
        <TextField
          label="Name"
          value={draft.name}
          onChange={(value) => set("name", value)}
          placeholder="Azureborn"
          hint="The id is built from this. Renaming later keeps the id, so nothing using it breaks."
        />
      </FieldSection>

      {type === "races" ? <RaceFields draft={draft} set={set} /> : null}
      {type === "subraces" ? <SubraceFields draft={draft} onChange={onChange} set={set} /> : null}
      {type === "equipment" ? <EquipmentFields draft={draft} set={set} /> : null}
      {type === "spells" ? <SpellFields draft={draft} set={set} /> : null}
      {type === "subclasses" ? <SubclassFields draft={draft} onChange={onChange} set={set} /> : null}
    </div>
  );
}

/** The setter every section is handed, so none of them re-implements the spread. */
type Setter = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) => void;

/**
 * The six racial bonus fields. Rendered as a row of small number inputs rather
 * than as add-a-bonus rows: there are exactly six abilities, the list never
 * grows, and a fixed grid is one tap per bonus instead of three.
 */
function AbilityBonusGrid({ draft, set }: { draft: FormDraft; set: Setter }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Ability bonuses</span>
      <p className="text-xs text-muted-foreground">
        Applied on top of the entered scores, and shown on the sheet as their own step. Leave a box blank for no bonus.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {ABILITIES.map((abil) => (
          <AbilityBonusInput
            key={abil}
            abil={abil}
            value={draft.abilityBonuses[abil]}
            onChange={(value) => set("abilityBonuses", { ...draft.abilityBonuses, [abil]: value })}
          />
        ))}
      </div>
    </div>
  );
}

function AbilityBonusInput({
  abil,
  value,
  onChange,
}: {
  abil: Abil;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{abil}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder="—"
        className="h-12 w-full rounded-lg border border-border bg-background px-3 text-center text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </label>
  );
}

function RaceFields({ draft, set }: { draft: FormDraft; set: Setter }) {
  return (
    <>
      <FieldSection title="Traits">
        <TextField
          label="Speed"
          value={draft.speed}
          onChange={(value) => set("speed", value)}
          inputMode="decimal"
          placeholder="30"
          hint="Walking speed in feet. The sheet reads this directly."
        />
        <AbilityBonusGrid draft={draft} set={set} />
        <TextField label="Size" value={draft.size} onChange={(value) => set("size", value)} placeholder="Medium" />
        <TextField
          label="Size description"
          value={draft.sizeDescription}
          onChange={(value) => set("sizeDescription", value)}
          placeholder="Between 5 and 6 feet tall."
        />
        <TextField
          label="Alignment"
          value={draft.alignment}
          onChange={(value) => set("alignment", value)}
          placeholder="Usually lawful."
        />
        <TextField label="Age" value={draft.age} onChange={(value) => set("age", value)} placeholder="Mature at 20." />
      </FieldSection>

      <FieldSection title="Languages">
        <TextField
          label="Languages"
          value={draft.languages}
          onChange={(value) => set("languages", value)}
          placeholder="Common, Azure"
          hint="Separated by commas."
        />
        <TextAreaField
          label="Language description"
          value={draft.languageDesc}
          onChange={(value) => set("languageDesc", value)}
          rows={2}
        />
      </FieldSection>
    </>
  );
}

/**
 * A subrace's parent is picked from the same list creation offers, homebrew
 * included — a homebrew subrace of a homebrew race is the obvious thing to
 * want and would otherwise be unauthorable.
 */
function SubraceFields({
  draft,
  onChange,
  set,
}: {
  draft: FormDraft;
  onChange: (draft: FormDraft) => void;
  set: Setter;
}) {
  const races = useRaceOptions();

  return (
    <>
      <FieldSection title="Parent">
        <PickerField
          label="Race"
          placeholder="Choose a race"
          options={races.data ?? []}
          pending={races.isPending}
          value={draft.parentRef}
          // The name travels with the ref: the stored entry holds a full
          // reference, and the ref alone carries only an index.
          onChange={(ref) =>
            onChange({
              ...draft,
              parentRef: ref,
              parentName: races.data?.find((one) => one.ref === ref)?.name ?? "",
            })
          }
        />
      </FieldSection>

      <FieldSection title="Traits">
        <TextAreaField label="Description" value={draft.desc} onChange={(value) => set("desc", value)} />
        <AbilityBonusGrid draft={draft} set={set} />
      </FieldSection>
    </>
  );
}

function EquipmentFields({ draft, set }: { draft: FormDraft; set: Setter }) {
  return (
    <FieldSection title="Item">
      <TextField
        label="Category"
        value={draft.category}
        onChange={(value) => set("category", value)}
        placeholder="Adventuring Gear"
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Cost"
          value={draft.costQuantity}
          onChange={(value) => set("costQuantity", value)}
          inputMode="decimal"
          placeholder="50"
        />
        <TextField label="Unit" value={draft.costUnit} onChange={(value) => set("costUnit", value)} placeholder="gp" />
      </div>
      <TextField
        label="Weight"
        value={draft.weight}
        onChange={(value) => set("weight", value)}
        inputMode="decimal"
        placeholder="3"
        hint="In pounds. Leave blank for an item with no listed weight."
      />
      <TextAreaField
        label="Description"
        value={draft.desc}
        onChange={(value) => set("desc", value)}
        hint="One paragraph per line."
      />
    </FieldSection>
  );
}

function SpellFields({ draft, set }: { draft: FormDraft; set: Setter }) {
  return (
    <>
      <FieldSection title="Casting">
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Level"
            value={draft.level}
            onChange={(value) => set("level", value)}
            inputMode="decimal"
            placeholder="3"
            hint="0 for a cantrip."
          />
          <TextField
            label="School"
            value={draft.school}
            onChange={(value) => set("school", value)}
            placeholder="Evocation"
          />
        </div>
        <TextField
          label="Casting time"
          value={draft.castingTime}
          onChange={(value) => set("castingTime", value)}
          placeholder="1 action"
        />
        <TextField label="Range" value={draft.range} onChange={(value) => set("range", value)} placeholder="120 feet" />
        <TextField
          label="Duration"
          value={draft.duration}
          onChange={(value) => set("duration", value)}
          placeholder="Instantaneous"
        />
        <TextField
          label="Components"
          value={draft.components}
          onChange={(value) => set("components", value)}
          placeholder="V, S, M"
          hint="Separated by commas."
        />
        <SwitchField label="Ritual" checked={draft.ritual} onChange={(value) => set("ritual", value)} />
        <SwitchField
          label="Concentration"
          checked={draft.concentration}
          onChange={(value) => set("concentration", value)}
        />
      </FieldSection>

      <FieldSection title="Description">
        <TextAreaField
          label="Effect"
          value={draft.desc}
          onChange={(value) => set("desc", value)}
          rows={6}
          hint="One paragraph per line."
        />
        <TextField
          label="Classes"
          value={draft.classNames.join(", ")}
          onChange={(value) =>
            set(
              "classNames",
              value
                .split(",")
                .map((one) => one.trim())
                .filter((one) => one !== ""),
            )
          }
          placeholder="Wizard, Sorcerer"
          hint="Who can learn it. Separated by commas."
        />
      </FieldSection>
    </>
  );
}

/**
 * The **minimal** subclass form: name, parent class, and level features as
 * prose. Not the full schema — worst case 625 leaves — and shipped anyway,
 * because the SRD has exactly one subclass per class and that is close to
 * unusable at a real table. Anything this cannot express is written in the
 * JSON editor, which accepts the same type.
 */
function SubclassFields({
  draft,
  onChange,
  set,
}: {
  draft: FormDraft;
  onChange: (draft: FormDraft) => void;
  set: Setter;
}) {
  const classes = useClassOptions();

  return (
    <>
      <FieldSection title="Parent">
        <PickerField
          label="Class"
          placeholder="Choose a class"
          options={classes.data ?? []}
          pending={classes.isPending}
          value={draft.parentRef}
          onChange={(ref) =>
            onChange({
              ...draft,
              parentRef: ref,
              parentName: classes.data?.find((one) => one.ref === ref)?.name ?? "",
            })
          }
        />
      </FieldSection>

      <FieldSection title="Features">
        <TextAreaField
          label="Level features"
          value={draft.desc}
          onChange={(value) => set("desc", value)}
          rows={8}
          placeholder={"Level 3: Storm Aura.\nLevel 6: Storm Soul."}
          hint="One per line, in your own words. The sheet shows them as written — it does not read levels out of them."
        />
      </FieldSection>
    </>
  );
}
