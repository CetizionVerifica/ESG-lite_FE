// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { FILE_QUESTIONS, assistantVisible, errorCopy, firstName, partialAnswer, plainAnswer, thinkingLines, wordCount, inlines, isAppPath, loadThread, markdownBlocks, requestFor, saveThread, starterQuestions, type ThreadTurn } from "./logic";

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

describe("the answer typing out", () => {
  const text = "Open **Add data** and pick [the site](/data/new) now.";
  it("never shows half-typed Markdown", () => {
    expect(partialAnswer(text, 0)).toBe("");
    expect(partialAnswer(text, 2)).toBe("Open **Add**");
    expect(partialAnswer(text, 3)).toBe("Open **Add data**");
    expect(partialAnswer(text, 6)).toBe("Open **Add data** and pick");
    expect(partialAnswer(text, 7)).toBe("Open **Add data** and pick [the site](/data/new)");
    expect(partialAnswer(text, wordCount(text))).toBe(text);
    expect(partialAnswer("Use `the code here` now", 2)).toBe("Use `the`");
  });
  it("counts words", () => {
    expect(wordCount("  one two\n\nthree ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
  it("copies as plain text", () => {
    expect(plainAnswer("Open **Add data**, then [the site](/data/new) and `Send`.")).toBe("Open Add data, then the site and Send.");
  });
});

describe("what it offers", () => {
  it("starts with what people ask on this page, for their role", () => {
    expect(starterQuestions("User", "/data/new")[0]).toBe("Can the AI read my bill for me?");
    expect(starterQuestions("User", "/data/new")).toHaveLength(3);
    expect(starterQuestions("Manager", "/data/new")[0]).toBe("How do I approve entries?");
    expect(starterQuestions("Manager", "/data/approvals")[0]).toBe("How do I approve several entries at once?");
    expect(starterQuestions("User")).toEqual(starterQuestions("User", "/settings"));
  });
  it("offers file questions, greets by first name and says what's happening", () => {
    expect(FILE_QUESTIONS).toContain("Is this accurate?");
    expect(firstName("Demo Noida")).toBe("Demo");
    expect(firstName(null)).toBe("");
    expect(thinkingLines(true)[0]).toBe("Reading your file…");
    expect(thinkingLines(false)[0]).toBe("Looking through the help articles…");
  });
  it("sends a file with the question, and never the file's contents with earlier turns", () => {
    const thread = [{ role: "user" as const, content: "What is it?", file: { name: "a.pdf", type: "pdf" as const } }, { role: "assistant" as const, content: "A bill.", followups: ["x"], callId: 3 }];
    const req = requestFor(thread, "Is it right?", null, { name: "a.pdf", type: "pdf", text: "Total 5" });
    expect(req.messages).toEqual([{ role: "user", content: "What is it?" }, { role: "assistant", content: "A bill." }, { role: "user", content: "Is it right?" }]);
    expect(req.attachment?.text).toBe("Total 5");
    expect(requestFor([], "Hi", null)).toEqual({ messages: [{ role: "user", content: "Hi" }], page: null });
  });
  it("explains a refused file", () => {
    expect(errorCopy(err("AS_FILES_OFF"))).toMatch(/Attaching files isn't turned on/);
    expect(errorCopy(err("AS_VALIDATION", { issues: [{ path: "attachment.images.0" }] }))).toMatch(/That file couldn't be sent/);
    expect(errorCopy(err("AS_VALIDATION", { issues: [{ path: "messages" }] }))).toMatch(/too long/);
  });
});
