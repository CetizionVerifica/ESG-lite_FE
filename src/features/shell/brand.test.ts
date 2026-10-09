import { describe, expect, it } from "vitest";
import { PLANETPULSE, STORED_BRANDS } from "../../theme";
import { PLATFORM_BRAND, brandForUser, pickLogo } from "./brand";
import { previewVars } from "./hooks/usePreviewStyle";
import { initials, shellUser } from "./account";
import { nextIndex } from "./menuKeys";
import { timeAgo } from "./timeAgo";

describe("logo slot", () => {
  const brand = { name: "Midal Cables", logoUrl: "light.png", logoOnDarkUrl: "dark.png" };
  it("uses logoOnDarkUrl on Classic and Night, logoUrl on Light", () => {
    expect(pickLogo(brand, "classic")).toEqual({ kind: "image", src: "dark.png", alt: "Midal Cables" });
    expect(pickLogo(brand, "night")).toMatchObject({ src: "dark.png" });
    expect(pickLogo(brand, "light")).toMatchObject({ src: "light.png" });
  });
  it("falls back to the company name", () => {
    expect(pickLogo({ name: "Glochem", logoUrl: "light.png" }, "classic")).toEqual({ kind: "name", name: "Glochem" });
    expect(pickLogo({ name: "Glochem" }, "light")).toEqual({ kind: "name", name: "Glochem" });
  });
  it("shows the user's company, and ESGLite for staff", () => {
    expect(brandForUser("Manager", { sites: [{ company: null }, { company: { name: "Midal Cables" } }] }, PLANETPULSE)).toEqual({ name: "Midal Cables" });
    expect(brandForUser("User", { site: { company: { name: "Chieron" } } }, PLANETPULSE)).toEqual({ name: "Chieron" });
    expect(brandForUser("Superadmin", { site: { company: { name: "Chieron" } } }, STORED_BRANDS[6])).toBe(PLATFORM_BRAND);
    expect(brandForUser("User", null, PLANETPULSE)).toBe(PLATFORM_BRAND);
  });
  it("uses the loaded brand pack's name and logos", () => {
    const pack = { ...STORED_BRANDS[1], logoUrl: "light.png", logoOnDarkUrl: "dark.png" };
    expect(brandForUser("Manager", { site: { company: { name: "Midal" } } }, pack)).toEqual({
      name: "Midal Cables",
      logoUrl: "light.png",
      logoOnDarkUrl: "dark.png",
    });
  });
});

describe("account helpers", () => {
  it("builds initials", () => {
    expect(initials("Shyam Sharma")).toBe("SS");
    expect(initials("ana maria de souza")).toBe("AS");
    expect(initials("Cher")).toBe("C");
    expect(initials("  ")).toBe("?");
  });
  it("falls back to email for the name", () => {
    expect(shellUser({ email: "a@b.co" }, "Admin")).toEqual({ name: "a@b.co", email: "a@b.co", role: "Admin" });
  });
});

describe("menu keys", () => {
  it("wraps and jumps", () => {
    expect(nextIndex(-1, "ArrowDown", 3)).toBe(0);
    expect(nextIndex(2, "ArrowDown", 3)).toBe(0);
    expect(nextIndex(0, "ArrowUp", 3)).toBe(2);
    expect(nextIndex(-1, "ArrowUp", 3)).toBe(2);
    expect(nextIndex(1, "Home", 3)).toBe(0);
    expect(nextIndex(1, "End", 3)).toBe(2);
    expect(nextIndex(1, "a", 3)).toBeNull();
    expect(nextIndex(0, "ArrowDown", 0)).toBeNull();
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  it("formats relative times", () => {
    expect(timeAgo("2026-10-09T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-09T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-10-09T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-07T12:00:00Z", now)).toBe("2d ago");
  });
});

describe("client theme preview", () => {
  const midal = { companyId: 1, name: "Midal Cables", primary: "#0b2e5c", accent: "#2f6fb0" };
  it("keeps the staff chrome and paints the brand's page", () => {
    const vars = previewVars({ ...midal, defaultLook: "classic" }, "light");
    expect(Object.keys(vars).some((k) => k.startsWith("--t-chrome"))).toBe(false);
    expect(vars["--t-page"]).toBeTruthy();
    expect(vars["--t-ink"]).toBeTruthy();
  });
  it("gives a Night-look brand its dark page with its light ink", () => {
    const night = previewVars({ ...midal, defaultLook: "night" }, "light");
    const light = previewVars({ ...midal, defaultLook: "light" }, "light");
    expect(night["--t-page"]).not.toBe(light["--t-page"]);
    expect(night["--t-ink"]).not.toBe(light["--t-ink"]);
  });
});
