// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { naturalWordingKey, readNaturalWording, useNaturalWording, writeNaturalWording } from "./aiPreference";

const auth = vi.hoisted(() => ({ user: { user_id: 12 } as unknown }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: auth.user }) }));

beforeEach(() => {
  localStorage.clear();
  auth.user = { user_id: 12 };
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useNaturalWording (IN-9)", () => {
  it("is off by default", () => {
    const { result } = renderHook(() => useNaturalWording());
    expect(result.current[0]).toBe(false);
  });

  it("remembers the choice per user", () => {
    const { result, rerender } = renderHook(() => useNaturalWording());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(naturalWordingKey(12))).toBe("1");

    auth.user = { user_id: 13 };
    rerender();
    expect(result.current[0]).toBe(false);

    auth.user = { user_id: 12 };
    rerender();
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(localStorage.getItem(naturalWordingKey(12))).toBeNull();
  });

  it("reads a stored choice on mount", () => {
    localStorage.setItem(naturalWordingKey(12), "1");
    const { result } = renderHook(() => useNaturalWording());
    expect(result.current[0]).toBe(true);
  });

  it("uses an anonymous key before the user is known", () => {
    auth.user = null;
    expect(naturalWordingKey(null)).toBe("insights.naturalWording.anon");
    const { result } = renderHook(() => useNaturalWording());
    act(() => result.current[1](true));
    expect(localStorage.getItem("insights.naturalWording.anon")).toBe("1");
  });

  it("works when storage throws: off, and the choice lasts for the view", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readNaturalWording("k")).toBe(false);
    expect(() => writeNaturalWording("k", true)).not.toThrow();
    const { result } = renderHook(() => useNaturalWording());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });
});
