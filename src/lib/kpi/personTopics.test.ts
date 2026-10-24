import { describe, expect, it } from "vitest";
import { draftFromTopics, movedNotes, sameTopics, toggleTopic, topicsBody } from "./personTopics";

describe("a person's KPI topics (D17)", () => {
  it("starts from what they own, keeps topic order when toggling, and sends sites only when limited", () => {
    const d = draftFromTopics({ topics: ["waste", "water"], by_site: [] });
    expect(d).toEqual({ topics: ["water", "waste"], siteIds: null });
    const more = toggleTopic(d, "climate");
    expect(more.topics).toEqual(["climate", "water", "waste"]);
    expect(toggleTopic(more, "water").topics).toEqual(["climate", "waste"]);
    expect(topicsBody(more)).toEqual({ topics: ["climate", "water", "waste"] });
    expect(topicsBody({ ...more, siteIds: [3, 1] })).toEqual({ topics: ["climate", "water", "waste"], site_ids: [1, 3] });
    expect(sameTopics(d, { topics: ["water", "waste"], siteIds: null })).toBe(true);
    expect(sameTopics(d, { ...d, siteIds: [1] })).toBe(false);
    expect(draftFromTopics(undefined)).toEqual({ topics: [], siteIds: null });
  });

  it("words the moves for the toast", () => {
    expect(movedNotes([], "Priya")).toBeUndefined();
    expect(movedNotes([{ site_id: 4, site_name: "Noida", topic: "water", from_user_id: 2, from_name: "Ravi" }], "Priya")).toBe("Water at Noida moved from Ravi to Priya.");
    expect(movedNotes([{ site_id: null, site_name: null, topic: "governance", from_user_id: null, from_name: null }], "Priya")).toBe("Governance for the company moved to Priya.");
    const many = ["water", "waste", "energy", "climate", "pollution"].map((topic) => ({ site_id: 1, site_name: "Noida", topic: topic as "water", from_user_id: 2, from_name: "Ravi" }));
    expect(movedNotes(many, "Priya")).toMatch(/ And 2 more\.$/);
  });
});
