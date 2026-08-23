import { PickerField, useClassOptions, useRaceOptions } from "@/features/dnd/content";
import { ABILITIES, type Abil } from "@/features/dnd/db/schema";
import type { FormDraft, ModifierDraft } from "@/features/dnd/homebrew/drafts";
import { emptyModifierDraft } from "@/features/dnd/homebrew/drafts";
import { FieldSection, SwitchField, TextAreaField, TextField } from "@/features/dnd/homebrew/fields";
import type { HomebrewType } from "@/features/dnd/homebrew/types";
import { cn } from "@/lib/utils";

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
 * The **minimal** subclass form: name, parent class, level features as prose,
 * and the modifier records those features contribute. Not the full schema —
 * worst case 625 leaves — and shipped anyway, because the SRD has exactly one
 * subclass per class and that is close to unusable at a real table. Anything
 * this cannot express is written in the JSON editor, which accepts the same
 * type.
 *
 * The modifier records were deferred out of
 * [#165](https://github.com/Otisz/sheetcraft/issues/165) and landed in
 * [#174](https://github.com/Otisz/sheetcraft/issues/174). They had nowhere to
 * go at the time: a modifier lived only on the CHARACTER record, and every
 * vendored catalog schema is a `z.strictObject` that rejects an entry carrying
 * one — so the form could not have both them and "entries conform to the same
 * schema as catalog entries".
 *
 * What shipped is a **side-car**: `modifiers` sits on the stored row beside
 * `updatedAt` and OUTSIDE the vendored payload, so the strict schema is
 * untouched and `validateEntry` still means what it meant. `stripSideCar` in
 * `validate.ts` is the seam; `entry-modifiers.ts` is what the records become on
 * a character. See ADR-0006.
 *
 * The rows are authored here for `subclasses` only. Storage and application
 * are type-agnostic, so the other six types reach the same field through the
 * JSON editor.
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

      <FieldSection title="What it changes">
        <ModifierRows rows={draft.modifiers} onChange={(rows) => set("modifiers", rows)} />
      </FieldSection>
    </>
  );
}

/**
 * The modifier rows: what the entry does to a character that takes it.
 *
 * **Add-a-row rather than a fixed grid**, which is the opposite of
 * `AbilityBonusGrid` above and for the opposite reason — there are exactly six
 * abilities and the list never grows, while a subclass may change nothing at
 * all or four different values.
 *
 * Starts EMPTY, with no blank row waiting. Most subclasses change no number
 * this app derives — their features are prose, exactly as the SRD's are — and
 * a row sitting open would read as a field that ought to be filled in.
 */
function ModifierRows({ rows, onChange }: { rows: ModifierDraft[]; onChange: (rows: ModifierDraft[]) => void }) {
  function update(position: number, row: ModifierDraft) {
    onChange(rows.map((existing, index) => (index === position ? row : existing)));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Numbers this subclass changes on the sheet. Leave it empty if its features are prose — most are. Each one
        arrives switched on, and the player can turn it off in Effects.
      </p>

      {rows.map((row, position) => (
        <ModifierRow
          // Position, not content: every field is free-text and two identical
          // blank rows would collide on any content-derived key, remounting
          // both on every keystroke.
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are reordered only by add and remove
          key={position}
          row={row}
          onChange={(next) => update(position, next)}
          onRemove={() => onChange(rows.filter((_, index) => index !== position))}
        />
      ))}

      <button
        type="button"
        onClick={() => onChange([...rows, emptyModifierDraft()])}
        className="h-12 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground active:bg-muted"
      >
        Add something it changes
      </button>
    </div>
  );
}

/**
 * One record. The four fields the side-car stores, in the order they read as a
 * sentence: this *value* is *op*ed onto this *target*, and it is called *label*.
 */
function ModifierRow({
  row,
  onChange,
  onRemove,
}: {
  row: ModifierDraft;
  onChange: (row: ModifierDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <TextField
        label="What it changes"
        value={row.target}
        onChange={(value) => onChange({ ...row, target: value })}
        placeholder="ac"
        hint="One of: ac, maxHp, speed, initiative, passivePerception, proficiencyBonus, spell.saveDc, spell.attack, or ability.<abil>, save.<abil>, skill.<name>."
      />

      <OpField value={row.op} onChange={(value) => onChange({ ...row, op: value })} />

      <TextField
        label="By how much"
        value={row.value}
        onChange={(value) => onChange({ ...row, value })}
        placeholder="1"
        hint="A number, or something the sheet looks up: level, proficiencyBonus, mod.con, score.str."
      />

      <TextField
        label="Called"
        value={row.label}
        onChange={(value) => onChange({ ...row, label: value })}
        placeholder="Storm Ward"
        hint="What the sheet says when it explains where the number came from."
      />

      <button type="button" onClick={onRemove} className="h-11 text-sm font-medium text-destructive active:bg-muted">
        Remove
      </button>
    </div>
  );
}

/**
 * The four ops, as buttons rather than a text field.
 *
 * A closed set of four is a choice, not a thing to type, and `min`/`max` are
 * the pair people get backwards — the labels say which bound they are, because
 * "min" naming a FLOOR is the SRD's reading and not the obvious one.
 */
function OpField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">How</span>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {OP_CHOICES.map((choice) => (
          <button
            key={choice.op}
            type="button"
            aria-pressed={value === choice.op}
            onClick={() => onChange(choice.op)}
            className={cn(
              "h-10 flex-1 rounded-md text-sm font-medium",
              value === choice.op ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The op vocabulary, labelled by what it DOES rather than by its key.
 * `min` is a floor and `max` is a ceiling — see CONTEXT.md § Modifier record,
 * where the naming is the SRD's and deliberately not the arithmetic function's.
 */
const OP_CHOICES = [
  { op: "add", label: "Add" },
  { op: "set", label: "Set to" },
  { op: "min", label: "At least" },
  { op: "max", label: "At most" },
] as const;
