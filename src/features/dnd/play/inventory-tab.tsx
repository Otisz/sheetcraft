import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CharacterRecord, Currency } from "@/features/dnd/db/schema";
import { nameFor } from "@/features/dnd/play/format";
import type { TabData } from "@/features/dnd/play/tab-data";
import { currencyRows } from "@/features/dnd/play/tabs";

/**
 * The Inventory tab: currency, then the items carried.
 *
 * Currency is **play state** — money changes every session — which is why it is
 * directly editable here while everything else on the sheet's data half is not.
 * See CONTEXT.md § Currency.
 */
export function InventoryTab({
  character,
  names,
  onCurrencyChange,
}: {
  character: CharacterRecord;
  names: TabData["names"];
  onCurrencyChange: (currency: Currency) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <CurrencySection currency={character.play.currency} onCurrencyChange={onCurrencyChange} />
      <Items equipment={character.equipment} names={names} />
    </div>
  );
}

/**
 * The ceiling on one coin pile. Far past any real hoard, and comfortably inside
 * the range that survives a JSON round-trip into a backup file.
 */
const MAX_COINS = 999_999;

/**
 * The five coins, cp → pp ascending.
 *
 * The order comes from the record's own key order rather than from a list here:
 * CONTEXT.md declares the keys ascending precisely so the sheet can render from
 * `Object.entries`, and restating it would be a second place to get it wrong.
 *
 * A coin the character has none of still gets a row — a missing one would read
 * as "this character cannot hold platinum", and the row is where the first one
 * is added.
 */
function CurrencySection({
  currency,
  onCurrencyChange,
}: {
  currency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}) {
  return (
    <section aria-label="Currency" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Currency</h2>
      <ul className="flex flex-col gap-1.5">
        {currencyRows(currency).map((row) => (
          <li key={row.unit} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
            <span className="w-20 shrink-0 text-sm font-medium">{row.label}</span>

            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Spend one ${row.label.toLowerCase()}`}
              // Coins floor at zero: a negative purse is not a debt Sheetcraft
              // models, it is a mis-tap.
              disabled={row.amount === 0}
              onClick={() => onCurrencyChange({ ...currency, [row.unit]: Math.max(0, row.amount - 1) })}
            >
              <Minus />
            </Button>

            <span className="flex-1 text-center text-lg font-bold tabular-nums">{row.amount}</span>

            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Gain one ${row.label.toLowerCase()}`}
              // Capped as well as floored. Nothing in the rules bounds a purse,
              // but an unbounded counter reachable by held tap eventually leaves
              // the safe-integer range and starts storing a number that will not
              // round-trip through a backup file.
              disabled={row.amount >= MAX_COINS}
              onClick={() => onCurrencyChange({ ...currency, [row.unit]: Math.min(MAX_COINS, row.amount + 1) })}
            >
              <Plus />
            </Button>

            <span className="w-6 shrink-0 text-right text-[0.7rem] text-muted-foreground uppercase">{row.unit}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The carried items.
 *
 * Equipped is shown as a marker rather than a switch: equipping changes AC, and
 * AC is derived — so the toggle belongs with the edit surface behind the `⋯`
 * menu, not on a play screen where a mis-tap silently moves a number.
 */
function Items({ equipment, names }: { equipment: CharacterRecord["equipment"]; names: TabData["names"] }) {
  return (
    <section aria-label="Items" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Items</h2>

      {equipment.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
          Nothing carried.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {equipment.map((entry) => (
            <li key={entry.itemRef} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{nameFor(names, entry.itemRef)}</span>
              {entry.quantity > 1 ? (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">×{entry.quantity}</span>
              ) : null}
              {entry.equipped ? (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] font-medium text-primary">
                  Equipped
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
