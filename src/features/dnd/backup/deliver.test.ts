import { describe, expect, it, vi } from "vitest";
import type { DeliveryEnvironment } from "@/features/dnd/backup/deliver";
import { backupFile, deliverBackup } from "@/features/dnd/backup/deliver";

/**
 * The delivery path is the half of export that is browser behaviour rather
 * than data, so every capability it touches arrives through
 * `DeliveryEnvironment` and is a plain object here. See CONTEXT.md § Backup file.
 */

function anchorStub() {
  return { href: "", download: "", click: vi.fn(), rel: "", target: "" };
}

function environment(overrides: Partial<DeliveryEnvironment> = {}): DeliveryEnvironment {
  return {
    canShare: () => false,
    share: () => Promise.reject(new Error("share should not have been called")),
    createObjectURL: () => "blob:stub",
    revokeObjectURL: vi.fn(),
    createAnchor: anchorStub,
    scheduleRevoke: (revoke) => revoke(),
    ...overrides,
  };
}

const FILE = new File(["{}"], "sheetcraft-backup-2026-08-23.json", { type: "application/json" });

describe("backupFile", () => {
  it("builds a File synchronously, so the caller can construct it before any await", () => {
    const file = backupFile({ format: "sheetcraft.dnd2014.backup" }, "sheetcraft-backup.json");

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("sheetcraft-backup.json");
    // The media type, not the whole header — the platform may append a charset.
    expect(file.type).toMatch(/^application\/json\b/);
  });
});

describe("deliverBackup", () => {
  it("shares when the platform can share files", async () => {
    const share = vi.fn(() => Promise.resolve());
    const createObjectURL = vi.fn(() => "blob:stub");

    const outcome = await deliverBackup(FILE, environment({ canShare: () => true, share, createObjectURL }));

    expect(outcome).toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [FILE] });
    // No download behind the share — two copies of one backup is two things to
    // reconcile in the Files app.
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("treats AbortError as the user cancelling, and does not fall through to a download", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const createObjectURL = vi.fn(() => "blob:stub");

    const outcome = await deliverBackup(
      FILE,
      environment({ canShare: () => true, share: () => Promise.reject(abort), createObjectURL }),
    );

    expect(outcome).toBe("cancelled");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("falls back to a download when the share fails for any other reason", async () => {
    const anchor = anchorStub();
    const outcome = await deliverBackup(
      FILE,
      environment({
        canShare: () => true,
        share: () => Promise.reject(new Error("no share target")),
        createAnchor: () => anchor,
      }),
    );

    expect(outcome).toBe("downloaded");
    expect(anchor.click).toHaveBeenCalled();
    expect(anchor.download).toBe(FILE.name);
    expect(anchor.href).toBe("blob:stub");
  });

  it("downloads when the platform cannot share files at all", async () => {
    const anchor = anchorStub();

    const outcome = await deliverBackup(FILE, environment({ createAnchor: () => anchor }));

    expect(outcome).toBe("downloaded");
    expect(anchor.click).toHaveBeenCalled();
  });

  it("revokes the object URL on a delay — an immediate revoke can cancel the download", async () => {
    const revokeObjectURL = vi.fn();
    const scheduleRevoke = vi.fn();

    await deliverBackup(FILE, environment({ revokeObjectURL, scheduleRevoke }));

    // Scheduled, not called: the revoke is handed to the timer, not run inline.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(scheduleRevoke).toHaveBeenCalledOnce();

    scheduleRevoke.mock.calls[0][0]();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:stub");
  });

  it("does not probe share at all when the platform has no Web Share", async () => {
    const canShare = vi.fn(() => false);

    const outcome = await deliverBackup(FILE, environment({ canShare }));

    expect(outcome).toBe("downloaded");
    expect(canShare).toHaveBeenCalledWith({ files: [FILE] });
  });
});
