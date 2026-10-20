import { describe, expect, it } from "vitest";
import ghgFixture from "../../../test/fixtures/studio/ghg-doc.json";
import type { ReportDoc } from "../../../lib/studio/contracts";
import { removeElements } from "../../../lib/studio/docOps";
import { editorReducer, initialState } from "./state";

const doc = () => JSON.parse(JSON.stringify(ghgFixture)) as ReportDoc;

describe("editor state", () => {
  it("the open tab closes the drawer; the Position panel replaces it", () => {
    let s = initialState(doc());
    s = editorReducer(s, { type: "drawer", drawer: "data", toggle: true });
    expect(s.ui.drawer).toBe("data");
    s = editorReducer(s, { type: "position", tab: "layers" });
    expect(s.ui.position).toBe("layers");
    s = editorReducer(s, { type: "drawer", drawer: "data", toggle: true });
    expect(s.ui.position).toBeNull();
    expect(s.ui.drawer).toBe("data");
    s = editorReducer(s, { type: "drawer", drawer: "data", toggle: true });
    expect(s.ui.drawer).toBeNull();
  });

  it("drops a selection that undo or delete removed", () => {
    let s = initialState(doc());
    s = editorReducer(s, { type: "select", ids: ["p-scope3.cat4"], pageId: "p-scope3" });
    s = editorReducer(s, { type: "commit", doc: removeElements(s.history.present, "p-scope3", ["p-scope3.cat4"]), label: "Delete" });
    expect(s.ui.selection).toEqual([]);
    s = editorReducer(s, { type: "undo" });
    expect(s.history.present.pages[2]).toBeTruthy();
    s = editorReducer(s, { type: "redo" });
    expect(s.history.past).toHaveLength(1);
  });

  it("zoom clamps to 10–400 % and leaves Fit; changing page clears the selection", () => {
    let s = initialState(doc());
    s = editorReducer(s, { type: "zoom", zoom: 9 });
    expect(s.ui.zoom).toBe(4);
    expect(s.ui.fit).toBe(false);
    s = editorReducer(s, { type: "zoom", zoom: 0.01 });
    expect(s.ui.zoom).toBe(0.1);
    s = editorReducer(s, { type: "select", ids: ["p-cover.qr"], pageId: "p-cover" });
    s = editorReducer(s, { type: "page", pageId: "p-scope3" });
    expect(s.ui.selection).toEqual([]);
  });
});
