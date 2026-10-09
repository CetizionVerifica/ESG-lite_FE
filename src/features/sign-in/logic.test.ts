import { describe, expect, it } from "vitest";
import {
  coverTitle,
  errorMessage,
  errorStatus,
  isClientSlug,
  passwordStrength,
  validateReset,
  wrongDoor,
  wrongDoorMessage,
} from "./logic";

describe("wrongDoor", () => {
  it("lets client roles in through the client door", () => {
    for (const role of ["User", "Manager", "Admin"]) expect(wrongDoor(role, "client")).toBeNull();
  });
  it("sends staff from the client door to the staff door", () => {
    expect(wrongDoor("Superadmin", "client")).toBe("staff");
    expect(wrongDoorMessage("staff")).toMatch(/staff sign-in/);
  });
  it("sends everyone else from the staff door to the client door", () => {
    expect(wrongDoor("Manager", "staff")).toBe("client");
    expect(wrongDoor(null, "staff")).toBe("client");
    expect(wrongDoor("Superadmin", "staff")).toBeNull();
  });
});

describe("errors", () => {
  it("prefers the server message", () => {
    expect(errorMessage({ response: { data: { message: "Account locked" } } }, "x")).toBe("Account locked");
    expect(errorMessage({ response: { data: { message: "  " } } }, "fallback")).toBe("fallback");
    expect(errorMessage(new Error("net"), "fallback")).toBe("fallback");
  });
  it("reads the status, null when there was no response", () => {
    expect(errorStatus({ response: { status: 404 } })).toBe(404);
    expect(errorStatus(new Error("net"))).toBeNull();
  });
});

describe("isClientSlug", () => {
  it("accepts lower-case slugs only", () => {
    expect(isClientSlug("midal")).toBe(true);
    expect(isClientSlug("midal-cables-2")).toBe(true);
    expect(isClientSlug("Midal")).toBe(false);
    expect(isClientSlug("-midal")).toBe(false);
    expect(isClientSlug("mi dal")).toBe(false);
    expect(isClientSlug(undefined)).toBe(false);
  });
});

describe("passwordStrength", () => {
  it("is too short under 8 characters", () => {
    expect(passwordStrength("Ab1!xyz").label).toBe("Too short");
  });
  it("rises with variety and length", () => {
    expect(passwordStrength("abcdefgh").level).toBe(1);
    expect(passwordStrength("abcdefg1").level).toBe(1);
    expect(passwordStrength("abcdeF1!").level).toBe(3);
    expect(passwordStrength("abcdefghijkL1!").level).toBe(4);
  });
});

describe("validateReset", () => {
  it("needs 8 characters and a matching confirmation", () => {
    expect(validateReset("short", "short")).toEqual({ password: "Use at least 8 characters." });
    expect(validateReset("longenough", "different")).toEqual({ confirm: "The passwords don't match." });
    expect(validateReset("longenough", "longenough")).toEqual({});
  });
});

it("names the client on the cover when known", () => {
  expect(coverTitle("Midal Cables")).toBe("Carbon reporting for Midal Cables");
  expect(coverTitle(null)).toBe("Carbon reporting for your company");
});
