import { describe, expect, it } from "vitest";
import { PLATFORM_BRAND, brandForUser, pickLogo } from "./brand";
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
    expect(brandForUser("Manager", { sites: [{ company: null }, { company: { name: "Midal Cables" } }] })).toEqual({ name: "Midal Cables" });
    expect(brandForUser("User", { site: { company: { name: "Chieron" } } })).toEqual({ name: "Chieron" });
    expect(brandForUser("Superadmin", { site: { company: { name: "Chieron" } } })).toBe(PLATFORM_BRAND);
    expect(brandForUser("User", null)).toBe(PLATFORM_BRAND);
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
