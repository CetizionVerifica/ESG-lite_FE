import { describe, expect, it } from "vitest";
import { reviewWorkflowOn } from "./reviewWorkflow";

const on = { review_workflow_v2: true };
const off = { review_workflow_v2: false };

describe("reviewWorkflowOn", () => {
  it("is off without a company flag (today's companies)", () => {
    expect(reviewWorkflowOn(null)).toBe(false);
    expect(reviewWorkflowOn({ site: { site_id: 1, company: { company_id: 3 } } })).toBe(false);
    expect(reviewWorkflowOn({ site: { site_id: 1, company: off } })).toBe(false);
  });

  it("is on when the user's site's company has it on", () => {
    expect(reviewWorkflowOn({ site: { site_id: 1, company: on } })).toBe(true);
    expect(reviewWorkflowOn({ sites: [{ site_id: 1, company: off }, { site_id: 2, company: on }] })).toBe(true);
    expect(reviewWorkflowOn({ company: on })).toBe(true);
  });

  it("reads the given site's company when there is one", () => {
    const user = { sites: [{ site_id: 1, company: off }, { site_id: 2, company: on }] };
    expect(reviewWorkflowOn(user, 1)).toBe(false);
    expect(reviewWorkflowOn(user, 2)).toBe(true);
  });

  it("only takes a real true, not a truthy string", () => {
    expect(reviewWorkflowOn({ site: { site_id: 1, company: { review_workflow_v2: "true" } } })).toBe(false);
  });
});
