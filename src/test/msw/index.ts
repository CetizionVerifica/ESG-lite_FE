/**
 * Every mock handler, for a test that wants the whole API:
 *   const server = setupServer(...handlers);   // from "msw/node"
 * KPI handlers come first: MSW's `*` also matches slashes, so Scope 3's
 * `*\/periods/lock` would otherwise answer `/kpi/periods/lock`.
 */
import { kpiHandlers } from "./kpi";
import { scope3Handlers } from "./scope3";
import { studioHandlers } from "./studio"; // DS-0

// DS-0: studio handlers first; they only match paths under `/studio/`.
export const handlers = [...studioHandlers, ...kpiHandlers, ...scope3Handlers];
export { resetKpiMocks, setKpiMockEnabled } from "./kpi";
export { resetScope3Mocks } from "./scope3";
export { resetStudioMocks, setStudioMockEnabled, setStudioMockKpi, studioMockDoc } from "./studio"; // DS-0
