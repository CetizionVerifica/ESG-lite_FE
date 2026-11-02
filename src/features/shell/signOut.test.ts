import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_STORAGE_KEY, readStoredClientId, storeClientId } from "../../lib/clientContext";
import { signOutSession } from "./signOut";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signOutSession", () => {
  it("clears the stored client, the session and the cache, then goes to sign-in", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    storeClientId(7);
    expect(localStorage.getItem(CLIENT_STORAGE_KEY)).toBe("7");

    const calls: string[] = [];
    let clientId: number | null = 7;
    signOutSession({
      // A logout that leaves other keys alone must still not leak the client.
      logout: () => calls.push("logout"),
      setClientId: (id) => {
        clientId = id;
        storeClientId(id);
      },
      clearQueries: () => calls.push("clear"),
      navigate: (to) => calls.push(`navigate:${to}`),
    });

    expect(clientId).toBeNull();
    expect(localStorage.getItem(CLIENT_STORAGE_KEY)).toBeNull();
    expect(readStoredClientId()).toBeNull();
    expect(calls).toEqual(["logout", "clear", "navigate:/login"]);
  });

  it("forgets the help assistant's conversations and nothing else", () => {
    vi.stubGlobal("sessionStorage", memoryStorage());
    sessionStorage.setItem("esglite.assistant.thread.7", "[]");
    sessionStorage.setItem("something.else", "keep");
    signOutSession({ logout: () => {}, setClientId: () => {}, clearQueries: () => {}, navigate: () => {} });
    expect(sessionStorage.getItem("esglite.assistant.thread.7")).toBeNull();
    expect(sessionStorage.getItem("something.else")).toBe("keep");
  });
});
