// Design Studio API (DS-0): `/studio/*` on ESG-lite (docs/design-studio/01-contracts.md §4).
// DS-0 adds the status call; each module adds its own calls here or in
// src/features/studio/api.ts (TanStack Query hooks).
import api from "../api/axios";
import type { StudioStatus } from "../lib/studio/contracts";

const companyParams = (companyId: number | null | undefined) => (companyId ? { company_id: companyId } : undefined);

/** GET /studio/status: answers while the switch is off. A body that isn't an object reads as `{}`. */
export async function getStudioStatus(companyId?: number | null): Promise<Partial<StudioStatus>> {
  const { data } = await api.get("/studio/status", { params: companyParams(companyId) });
  return data && typeof data === "object" ? (data as Partial<StudioStatus>) : {};
}
