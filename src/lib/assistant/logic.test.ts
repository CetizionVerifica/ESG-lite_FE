// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { assistantVisible, errorCopy, inlines, isAppPath, loadThread, markdownBlocks, requestFor, saveThread, starterQuestions, type ThreadTurn } from "./logic";

const err = (code: string, details?: unknown) => ({ response: { data: { code, details } } });

describe("markdown answers", () => {
  it("makes paragraphs and numbered or bulleted lists", () => {
    expect(markdownBlocks("Hi there.\nSecond line.\n\n1. Open it.\n2. Click **Send**.\n- a\n- b")).toEqual([
      { type: "p", inlines: [{ t: "text", v: "Hi there. Second line." }] },
      { type: "ol", items: [[{ t: "text", v: "Open it." }], [{ t: "text", v: "Click " }, { t: "bold", v: "Send" }, { t: "text", v: "." }]] },
      { type: "ul", items: [[{ t: "text", v: "a" }], [{ t: "text", v: "b" }]] },
    ]);
  });

  it("keeps links to app paths only; other links and headings become text", () => {
    expect(inlines("See [Add data](/data/new), [x](https://evil.com), [y](//evil.com) and `code`")).toEqual([
      { t: "text", v: "See " },
      { t: "link", label: "Add data", to: "/data/new" },
      { t: "text", v: ", " },
      { t: "text", v: "x" },
      { t: "text", v: ", " },
      { t: "text", v: "y" },
      { t: "text", v: " and " },
      { t: "code", v: "code" },
    ]);
    expect(isAppPath("/data/mine?status=pending")).toBe(true);
    expect(isAppPath("javascript:alert(1)")).toBe(false);
    expect(markdownBlocks("## Steps\n<b>raw</b>")).toEqual([{ type: "p", inlines: [{ t: "text", v: "Steps <b>raw</b>" }] }]);
  });
});

describe("the request", () => {
  const turns = (n: number): ThreadTurn[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `t${i}` }));

  it("sends the last turns that fit, then the trimmed question and the page", () => {
    const r = requestFor(turns(20), "  How?  ", { path: "/data/new", title: "Add data" });
    expect(r.messages).toHaveLength(11);
    expect(r.messages[0]).toEqual({ role: "user", content: "t10" });
    expect(r.messages[r.messages.length - 1]).toEqual({ role: "user", content: "How?" });
    expect(r.page).toEqual({ path: "/data/new", title: "Add data" });
  });

  it("never starts with an answer and cuts long answers", () => {
    const r = requestFor([{ role: "assistant", content: "x".repeat(5000) }, { role: "user", content: "q1" }, { role: "assistant", content: "y".repeat(5000) }], "q2", null);
    expect(r.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(r.messages[1].content).toHaveLength(4000);
  });
});

describe("copy and visibility", () => {
  it("says what each server code means", () => {
    expect(errorCopy(err("AS_OFF"))).toMatch(/isn't turned on/);
    expect(errorCopy(err("AS_BUDGET", { limit: "user_day_calls" }))).toMatch(/again tomorrow/);
    expect(errorCopy(err("AS_BUDGET", { limit: "company_month_usd" }))).toMatch(/this month's limit/);
    expect(errorCopy(err("AS_VALIDATION"))).toMatch(/2,000 characters/);
    expect(errorCopy(err("AS_AI_UNAVAILABLE"))).toMatch(/can't answer right now/);
    expect(errorCopy(new Error("network"))).toBe("Something went wrong. Try again.");
  });

  it("starter questions per role, a User's when the role is unknown", () => {
    expect(starterQuestions("Manager")[0]).toBe("How do I approve entries?");
    expect(starterQuestions(null)).toEqual(starterQuestions("User"));
  });

  it("shows the button only when on and configured", () => {
    expect(assistantVisible({ enabled: true, configured: true })).toBe(true);
    expect(assistantVisible({ enabled: true, configured: false })).toBe(false);
    expect(assistantVisible({ enabled: false, configured: true })).toBe(false);
    expect(assistantVisible(undefined)).toBe(false);
  });
});

describe("the thread for this tab", () => {
  afterEach(() => sessionStorage.clear());

  it("is kept per person and dropped when cleared; bad data reads as empty", () => {
    saveThread(7, [{ role: "user", content: "q" }, { role: "assistant", content: "a", sources: [] }]);
    expect(loadThread(7)).toHaveLength(2);
    expect(loadThread(8)).toEqual([]);
    saveThread(7, []);
    expect(sessionStorage.getItem("esglite.assistant.thread.7")).toBeNull();
    sessionStorage.setItem("esglite.assistant.thread.9", "{not json");
    expect(loadThread(9)).toEqual([]);
    sessionStorage.setItem("esglite.assistant.thread.9", JSON.stringify([{ role: "system", content: "x" }, { role: "user", content: "ok" }]));
    expect(loadThread(9)).toEqual([{ role: "user", content: "ok" }]);
  });
});
