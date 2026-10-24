import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LibraryDefinitionBody } from "../../../lib/kpi/contracts";
import {
  getLibraryDefinitions,
  getLibraryDisclosures,
  getLibraryFrameworks,
  getLibraryMappings,
  updateLibraryDefinition,
} from "../../../services/kpiService";
import type { Library } from "./logic";

export { kpiErrorMessage } from "../../../services/kpiService";

export const keys = {
  all: ["kpi", "library"] as const,
  frameworks: () => [...keys.all, "frameworks"] as const,
  definitions: () => [...keys.all, "definitions"] as const,
  disclosures: () => [...keys.all, "disclosures"] as const,
  mappings: () => [...keys.all, "mappings"] as const,
};

/** The whole library in four reads (fetched in parallel); `data` once all four are in. */
export function useLibrary() {
  const frameworks = useQuery({ queryKey: keys.frameworks(), queryFn: getLibraryFrameworks });
  const definitions = useQuery({ queryKey: keys.definitions(), queryFn: getLibraryDefinitions });
  const disclosures = useQuery({ queryKey: keys.disclosures(), queryFn: () => getLibraryDisclosures() });
  const mappings = useQuery({ queryKey: keys.mappings(), queryFn: () => getLibraryMappings() });
  const parts = [frameworks, definitions, disclosures, mappings];
  const data: Library | undefined =
    frameworks.data && definitions.data && disclosures.data && mappings.data
      ? { frameworks: frameworks.data, definitions: definitions.data, disclosures: disclosures.data, mappings: mappings.data }
      : undefined;
  return {
    data,
    isLoading: parts.some((p) => p.isLoading),
    error: parts.find((p) => p.isError)?.error ?? null,
    refetch: () => parts.filter((p) => p.isError).forEach((p) => void p.refetch()),
  };
}

export function useUpdateDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<LibraryDefinitionBody> }) => updateLibraryDefinition(id, patch),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.definitions() }),
  });
}
