import { describe, expect, it } from "vitest";
import { KPI_PILLARS, KPI_TOPICS, TOPIC_PILLAR } from "./contracts";
import { PILLAR_LABEL, PILLAR_LETTER } from "./labels";
import { differsFromTopicPillar, groupByPillar, pillarOf, pillarParam, topicPillarNote, topicsByPillar } from "./pillars";

describe("D19 pillars", () => {
  it("puts each topic in exactly one pillar, 7 · 7 · 2", () => {
    expect(Object.keys(TOPIC_PILLAR).sort()).toEqual([...KPI_TOPICS].sort());
    const count = (p: string) => KPI_TOPICS.filter((t) => TOPIC_PILLAR[t] === p).length;
    expect(KPI_PILLARS.map(count)).toEqual([7, 7, 2]);
    expect(KPI_PILLARS.map(count).reduce((a, b) => a + b)).toBe(KPI_TOPICS.length);
    expect(TOPIC_PILLAR.water).toBe("environment");
    expect(TOPIC_PILLAR.health_safety).toBe("social");
    expect(TOPIC_PILLAR.ethics).toBe("governance");
  });

  it("names and letters each pillar", () => {
    expect(KPI_PILLARS.map((p) => `${PILLAR_LETTER[p]} ${PILLAR_LABEL[p]}`)).toEqual(["E Environment", "S Social", "G Governance"]);
  });

  it("reads a KPI's own pillar, else the topic's", () => {
    expect(pillarOf({ topic: "water" })).toBe("environment");
    expect(pillarOf({ topic: "diversity", pillar: "governance" })).toBe("governance");
    expect(pillarOf({ topic: "diversity", pillar: "nonsense" })).toBe("social");
    expect(differsFromTopicPillar({ topic: "diversity", pillar: "governance" })).toBe(true);
    expect(differsFromTopicPillar({ topic: "water", pillar: "environment" })).toBe(false);
    expect(topicPillarNote("water")).toBe("Differs from its topic (Water → Environment)");
  });

  it("reads ?pillar= as a name or a letter", () => {
    expect(pillarParam("social")).toBe("social");
    expect(pillarParam("E")).toBe("environment");
    expect(pillarParam("g")).toBe("governance");
    expect(pillarParam("x")).toBeNull();
    expect(pillarParam(null)).toBeNull();
  });

  it("groups by pillar in E, S, G order and keeps the order inside", () => {
    const rows = [
      { n: "Board", topic: "governance" as const },
      { n: "Water", topic: "water" as const },
      { n: "Hires", topic: "workforce" as const },
      { n: "Energy", topic: "energy" as const },
    ];
    const g = groupByPillar(rows, pillarOf);
    expect(g.map((x) => [x.label, x.items.map((i) => i.n)])).toEqual([
      ["Environment", ["Water", "Energy"]],
      ["Social", ["Hires"]],
      ["Governance", ["Board"]],
    ]);
    expect(groupByPillar([] as typeof rows, pillarOf, true).map((x) => x.items.length)).toEqual([0, 0, 0]);
  });

  it("groups topics under their pillar in the library's topic order", () => {
    expect(topicsByPillar(["ethics", "water", "climate", "training"]).map((g) => [g.pillar, g.items])).toEqual([
      ["environment", ["climate", "water"]],
      ["social", ["training"]],
      ["governance", ["ethics"]],
    ]);
  });
});
