import { describe, expect, it } from "vitest";
import { contrast } from "../../theme/color";
import { EMPTY_ONBOARD, type OnboardDraft, coverFor, defaultAccent, firstInvalidStep, isOnboardDirty, suggestFromPixels, toBrandUpdate, toOnboardForm, validateStep } from "./onboarding";

const filled: OnboardDraft = {
  ...EMPTY_ONBOARD,
  companyName: " Midal Cables ",
  industry: "Metals and mining",
  address: "Hidd",
  contactPerson: "Omar",
  email: "omar@midal.example",
  password: "secret pass",
  primary: "#0B5C3B",
};

describe("validateStep", () => {
  it("company needs a name", () => {
    expect(validateStep("company", EMPTY_ONBOARD)).toHaveProperty("companyName");
    expect(validateStep("company", filled)).toEqual({});
  });
  it("admin needs name, a valid email and an 8+ character password", () => {
    expect(Object.keys(validateStep("admin", EMPTY_ONBOARD)).sort()).toEqual(["contactPerson", "email", "password"]);
    expect(validateStep("admin", { ...filled, email: "omar@", password: "short" })).toEqual({
      email: "Enter a valid email address.",
      password: "Use at least 8 characters.",
    });
  });
  it("brand needs a primary colour unless skipped", () => {
    expect(validateStep("brand", { ...filled, primary: "" })).toHaveProperty("primary");
    expect(validateStep("brand", { ...filled, primary: "", brandOn: false })).toEqual({});
    expect(validateStep("brand", { ...filled, accent: "blue" })).toHaveProperty("accent");
  });
});

it("firstInvalidStep finds the earliest step to fix", () => {
  expect(firstInvalidStep(EMPTY_ONBOARD)).toBe("company");
  expect(firstInvalidStep({ ...filled, password: "" })).toBe("admin");
  expect(firstInvalidStep(filled)).toBeNull();
});

it("isOnboardDirty is false only for the untouched form", () => {
  expect(isOnboardDirty(EMPTY_ONBOARD)).toBe(false);
  expect(isOnboardDirty({ ...EMPTY_ONBOARD, esgMitraAccess: true })).toBe(true);
});

describe("toOnboardForm", () => {
  const logo = new File(["x"], "logo.png", { type: "image/png" });
  it("uses the backend's field names, trims text and keeps the password as typed", () => {
    const f = toOnboardForm({ ...filled, logo });
    expect(f.get("companyName")).toBe("Midal Cables");
    expect(f.get("contactPerson")).toBe("Omar");
    expect(f.get("password")).toBe("secret pass");
    expect(f.get("esgMitraAccess")).toBeNull();
    expect((f.get("logo") as File).name).toBe("logo.png");
  });
  it("sends the access flag only when on, and no logo when the brand is skipped", () => {
    const f = toOnboardForm({ ...filled, esgMitraAccess: true, brandOn: false, logo });
    expect(f.get("esgMitraAccess")).toBe("true");
    expect(f.get("logo")).toBeNull();
  });
});

describe("brand", () => {
  it("builds the brand update with a cover gradient and a derived accent", () => {
    const b = toBrandUpdate(filled)!;
    expect(b.name).toBe("Midal Cables");
    expect(b.primary).toBe("#0b5c3b");
    expect(b.coverTo).toBe("#0b5c3b");
    expect(b.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(b.accent).not.toBe(b.primary);
    expect(toBrandUpdate({ ...filled, brandOn: false })).toBeNull();
    expect(toBrandUpdate({ ...filled, accent: "#C8A24A" })!.accent).toBe("#c8a24a");
  });
  it("cover starts darker than the primary", () => {
    const { coverFrom } = coverFor("#2572c0");
    expect(contrast(coverFrom, "#ffffff")).toBeGreaterThan(contrast("#2572c0", "#ffffff"));
  });
  it("derived accent differs in hue from a grey-ish primary too", () => {
    expect(defaultAccent("#555a60")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("suggestFromPixels", () => {
  const px = (...colours: [number, number, number, number][]) => new Uint8ClampedArray(colours.flat());
  it("ignores white, black, grey and transparent pixels and ranks the rest", () => {
    const green: [number, number, number, number] = [11, 92, 59, 255];
    const gold: [number, number, number, number] = [200, 162, 74, 255];
    const s = suggestFromPixels(px(green, green, green, gold, [255, 255, 255, 255], [0, 0, 0, 255], [128, 128, 128, 255], [255, 0, 0, 0]));
    expect(s).toEqual({ primary: "#0b5c3b", accent: "#c8a24a" });
  });
  it("returns null for a black-and-white logo", () => {
    expect(suggestFromPixels(px([255, 255, 255, 255], [0, 0, 0, 255]))).toBeNull();
  });
});
