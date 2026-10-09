import { describe, expect, it } from "vitest";
import {
  clientThemeLabel,
  isEnabled,
  modernZone,
  mergePreferences,
  notificationOptions,
  preferencesDirty,
  profileView,
  serverMessage,
  timezoneLabel,
  timezoneList,
  utcOffset,
} from "./logic";

describe("profileView", () => {
  it("merges a contributor's site and a manager's sites without repeats, sorted", () => {
    const view = profileView(
      {
        name: " Mia ",
        last_name: "Manager",
        phone_number: null,
        email: "mia@example.com",
        site: { site_id: 2, name: "Hidd plant" },
        sites: [{ site_id: 2, name: "Hidd plant" }, { site_id: 1, name: "Askar smelter" }],
      },
      "Manager",
    );
    expect(view).toEqual({ name: "Mia", lastName: "Manager", phone: "", email: "mia@example.com", role: "Manager", sites: ["Askar smelter", "Hidd plant"] });
  });

  it("copes with a missing user", () => {
    expect(profileView(null, null)).toEqual({ name: "", lastName: "", phone: "", email: "", role: "", sites: [] });
  });
});

describe("notifications", () => {
  it("lists the role's email toggles; Admin and Superadmin have none", () => {
    expect(notificationOptions("User").map((o) => o.key)).toEqual(["email_approvals", "email_rejections", "email_reminders"]);
    expect(notificationOptions("Manager").map((o) => o.key)).toEqual(["email_escalations"]);
    expect(notificationOptions("Admin")).toEqual([]);
    expect(notificationOptions("Superadmin")).toEqual([]);
    expect(notificationOptions(null)).toEqual([]);
  });

  it("treats a missing preference as on", () => {
    expect(isEnabled({}, "email_approvals")).toBe(true);
    expect(isEnabled({ email_approvals: false }, "email_approvals")).toBe(false);
  });

  it("keeps keys the page doesn't show when saving", () => {
    expect(mergePreferences({ email_escalations: false, email_approvals: true }, { email_approvals: false })).toEqual({
      email_escalations: false,
      email_approvals: false,
    });
  });

  it("is dirty only when an edit differs from what is saved", () => {
    expect(preferencesDirty({}, { email_approvals: true })).toBe(false);
    expect(preferencesDirty({}, { email_approvals: false })).toBe(true);
    expect(preferencesDirty({ email_approvals: false }, { email_approvals: false })).toBe(false);
  });
});

describe("timezones", () => {
  const jan = new Date("2025-01-15T12:00:00Z");

  it("labels a zone with city, region and offset", () => {
    expect(timezoneLabel("Asia/Bahrain", jan)).toBe("Bahrain, Asia (UTC+3)");
    expect(timezoneLabel("America/Argentina/Buenos_Aires", jan)).toBe("Buenos Aires, America / Argentina (UTC-3)");
    expect(timezoneLabel("Asia/Kolkata", jan)).toBe("Kolkata, Asia (UTC+5:30)");
    expect(timezoneLabel("UTC", jan)).toBe("UTC");
    expect(timezoneLabel("Europe/London", jan)).toBe("London, Europe (UTC)");
  });

  it("returns no offset for an unknown zone", () => {
    expect(utcOffset("Nowhere/Atlantis", jan)).toBe("");
    expect(timezoneLabel("Nowhere/Atlantis", jan)).toBe("Atlantis, Nowhere");
  });

  it("lists renamed zones under today's name", () => {
    const list = timezoneList(["Asia/Calcutta"]);
    expect(list).toContain("Asia/Kolkata");
    expect(list).not.toContain("Asia/Calcutta");
    expect(modernZone("Europe/Kiev")).toBe("Europe/Kyiv");
    expect(modernZone("Asia/Bahrain")).toBe("Asia/Bahrain");
    expect(modernZone(null)).toBeNull();
  });

  it("includes UTC and a saved zone the browser doesn't list, sorted", () => {
    const list = timezoneList(["Legacy/Zone", null]);
    expect(list).toContain("UTC");
    expect(list).toContain("Asia/Bahrain");
    expect(list).toContain("Legacy/Zone");
    expect([...list].sort((a, b) => a.localeCompare(b))).toEqual(list);
    expect(new Set(list).size).toBe(list.length);
  });
});

describe("labels", () => {
  it("names the client's theme and look", () => {
    expect(clientThemeLabel("Midal Cables", "classic")).toBe("Midal Cables · Classic");
  });

  it("prefers the server's message", () => {
    expect(serverMessage({ response: { data: { message: "Nope" } } }, "Fallback")).toBe("Nope");
    expect(serverMessage(new Error("x"), "Fallback")).toBe("Fallback");
  });
});
