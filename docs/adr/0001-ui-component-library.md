# ADR-0001: shadcn/ui on Base UI for the mobile sheet

- **Status:** Accepted
- **Date:** 2026-08-20
- **Ticket:** [Decide the UI component library for the mobile sheet](https://github.com/Otisz/sheetcraft/issues/146)

## Context

Sheetcraft is a mobile-primary D&D character sheet. The sheet needs a number stepper, bottom
sheet/drawer, modal dialog, tabs or accordion, searchable combobox (catalogs up to 319 spells),
toast, switch, popover and progress — all touch-first and accessible.

Installed stack (verified in `bun.lock`, not `package.json`, which pins `latest`):
React **19.2.8**, `babel-plugin-react-compiler` **1.0.0**, Tailwind **4.3.3**, Biome, zod 4.

## Decision

**Adopt shadcn/ui with the Base UI base** (`npx shadcn init`, or `-b base` explicitly), styled with
Tailwind. Components are copied into `src/components/ui/` as source we own.

## Rationale

**Base UI is the only surveyed library that ships every primitive we need**, and its Drawer is a
genuine bottom sheet — `swipeDirection`, `snapPoints`, `Drawer.SwipeArea`, and
`Drawer.VirtualKeyboardProvider` for keyboard-aware focus on mobile. It reached stable 1.0 on
2025-12-11 and is at **1.7.0** (2026-08-04) on a steady monthly cadence.

**Radix was rejected primarily because it has no Drawer at all** — the single most touch-critical
primitive in a mobile sheet. It also lacks a number stepper and a searchable combobox. It is
otherwise actively maintained; the common "Radix is abandoned" claim is false.

**Ark UI was rejected on weight**, not quality: its combobox machine alone is ~26.8 kB gzip and the
package totals ~272 kB across 67 deps. Its issue hygiene is the best of the three (8 open issues).

**shadcn over consuming Base UI directly** because the components land as editable source. The sheet
needs unusual behaviour — an HP control with heal/damage/temp modes, death saves replacing the HP
section — and owning the source avoids fighting a library's API. It also writes **kebab-case**
files by default, matching this repo's convention with no configuration.

**vaul is explicitly avoided.** Its author states verbatim: *"This repo is unmaintained."* Last
publish 2024-12-14. shadcn's **`radix` base still wraps vaul** for its drawer; the **`base` base
does not** — verified: `base-nova/drawer.json` declares only `@base-ui/react`, with zero vaul
references. This alone justifies choosing `base` over `radix`.

## Registry path — a real trap

`/r/styles/default/…` and `/r/styles/new-york-v4/…` are **frozen legacy endpoints**. They return
HTTP 200 and still serve the vaul-based drawer; a `?base=` query param is ignored. The live path is:

```
https://ui.shadcn.com/r/styles/{base}-{style}/{name}.json     # base ∈ base|radix|aria
```

Verified: `base-nova/drawer.json` → `["@base-ui/react"]`; `radix-nova/drawer.json` → `["vaul"]`.
Anything pinned to the legacy path silently misses the Base UI migration.

## Consequences

**We must build the HP control ourselves.** shadcn ships **no** number-field/stepper on any base
(404 across every style — confirmed), though Base UI upstream has `NumberField`. We wrap it.

The HP control is **steppers plus a heal/damage/temp mode selector**.

> **Amended 2026-08-21 after [the sheet prototype](https://github.com/Otisz/sheetcraft/issues/150).**
> This ADR originally ruled out a custom numpad, relying on `inputMode="numeric"` to raise the OS
> keypad. Driving the prototype on a phone reversed that: **both ship.** Steppers do ±1 inline; the
> HP value is a button opening a numpad drawer for arbitrary amounts, whose
> **Damage / Heal / Temp buttons are the commit — there is no Apply button.** The numpad is still a
> component we build ourselves, as no surveyed library ships one.

```
        HP  23 / 41
   [ − ]    [ 5 ]    [ + ]
   ( Damage | Heal | Temp )
```

**React Compiler:** no documented incompatibility for any surveyed library. React names only
`react-hook-form` (`watch`) and **TanStack Table (`useReactTable`)** as incompatible — relevant if
tables are added later, unrelated to this choice. The compiler auto-skips known-incompatible APIs
rather than breaking. Base UI's own compiler-adoption issue (mui/base-ui#809) is open with no stated
position — flagged as unconfirmed rather than assumed safe.

**Watch item:** Base UI #5358 reports a main-thread freeze on Select open/close under CPU load
(2026-07-28). We use Select/Combobox for the 319-spell picker, so verify against a real catalog
during the sheet prototype.

**Reversibility is good.** Owning the source means a future swap is per-component, not global. The
copied files are the seam.

## Alternatives rejected

| Option | Why not |
|---|---|
| Radix UI | No drawer, no stepper, no searchable combobox |
| Ark UI | ~272 kB gzip / 67 deps; heaviest surveyed |
| Base UI directly | Loses editable source; the sheet needs unusual behaviour |
| Bare Tailwind | Hand-rolling focus traps, ARIA and swipe gestures is the hard part |
| shadcn on `radix` base | Still wraps the unmaintained vaul for its drawer |
