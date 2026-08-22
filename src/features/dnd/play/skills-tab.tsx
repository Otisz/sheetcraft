import { refIndex } from "@/features/dnd/db/resolve-ref";
import { ABILITIES, type Abil, type CharacterRecord } from "@/features/dnd/db/schema";
import type { Derived, Skill } from "@/features/dnd/derive";
import { SKILLS } from "@/features/dnd/derive";
import { signed, titleCase } from "@/features/dnd/play/format";

/**
 * The Skills tab: saving throws, passive Perception, then the eighteen skills.
 *
 * **Saving throws head this tab rather than sitting on the main scroll.** They
 * are rolled about as often as skills, and grouping them here costs no space
 * above the fold — which is what the sheet is short of on a phone. See #164.
 *
 * Read-only, like every number in play mode. Editing which skills a character
 * is proficient in is character data and lives behind the `⋯` menu.
 */
export function SkillsTab({ character, derived }: { character: CharacterRecord; derived: Derived }) {
  return (
    <div className="flex flex-col gap-4">
      <SavingThrows character={character} derived={derived} />
      <PassivePerception value={derived.passivePerception} />
      <SkillList character={character} derived={derived} />
    </div>
  );
}

function SavingThrows({ character, derived }: { character: CharacterRecord; derived: Derived }) {
  const proficient = new Set<Abil>(character.proficiencies.saves);

  return (
    <section aria-label="Saving throws" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Saving throws</h2>
      <ul className="grid grid-cols-2 gap-2">
        {ABILITIES.map((abil) => (
          <li key={abil}>
            <Row
              proficient={proficient.has(abil)}
              label={abil.toUpperCase()}
              value={derived.saves[abil]}
              proficiencyLabel={`Proficient in ${abil.toUpperCase()} saves`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Passive Perception, given its own row rather than hidden among the skills:
 * it is the number a DM asks for without warning, so it is worth finding at a
 * glance. PHB p.175.
 */
function PassivePerception({ value }: { value: number }) {
  return (
    <section
      aria-label="Passive Perception"
      className="flex items-center justify-between rounded-xl border bg-card p-3"
    >
      <span className="text-sm font-medium">Passive Perception</span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
    </section>
  );
}

function SkillList({ character, derived }: { character: CharacterRecord; derived: Derived }) {
  // Proficiency is read off the character's own refs rather than re-derived
  // from the modifier: the engine folds proficiency into the base, so the
  // number alone cannot tell you whether a +5 came from proficiency or a cloak.
  // Through `refIndex` rather than a local split: the ref grammar is parsed in
  // exactly one place, and re-splitting it here would be a second one.
  const proficient = new Set(character.proficiencies.skills.map((ref) => refIndex(ref)));
  const expert = new Set(character.proficiencies.expertise.map((ref) => refIndex(ref)));

  return (
    <section aria-label="Skills" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Skills</h2>
      <ul className="flex flex-col gap-1.5">
        {(Object.keys(SKILLS) as Skill[]).map((skill) => (
          <li key={skill}>
            <Row
              // Expertise implies proficiency, so an expert skill is marked
              // even when only the expertise list names it.
              proficient={expert.has(skill) || proficient.has(skill)}
              expert={expert.has(skill)}
              label={titleCase(skill)}
              suffix={SKILLS[skill].toUpperCase()}
              value={derived.skills[skill]}
              proficiencyLabel={
                expert.has(skill) ? `Expertise in ${titleCase(skill)}` : `Proficient in ${titleCase(skill)}`
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One save or skill.
 *
 * Proficiency is marked by a filled dot **and** an accessible label, never by
 * colour alone — the dot is the only thing distinguishing a proficient +5 from
 * an unproficient one, and a sheet that hides that from a screen reader is
 * hiding the reason for the number.
 */
function Row({
  proficient,
  expert = false,
  label,
  suffix,
  value,
  proficiencyLabel,
}: {
  proficient: boolean;
  expert?: boolean;
  label: string;
  suffix?: string;
  value: number;
  proficiencyLabel: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
      {/*
        The dot is decoration; the proficiency it stands for is announced as
        real text in `sr-only`. An `aria-label` on the span would be the shorter
        spelling, but a bare span has no role to carry one — so the marker would
        be silent for exactly the readers that need it most.
      */}
      <span
        aria-hidden
        className={
          proficient
            ? `size-2.5 shrink-0 rounded-full ${expert ? "bg-amber-500" : "bg-foreground"}`
            : "size-2.5 shrink-0 rounded-full border border-muted-foreground/40"
        }
      />
      {proficient ? <span className="sr-only">{proficiencyLabel}</span> : null}
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {suffix ? <span className="text-[0.7rem] text-muted-foreground uppercase">{suffix}</span> : null}
      <span className="text-base font-semibold tabular-nums">{signed(value)}</span>
    </div>
  );
}
