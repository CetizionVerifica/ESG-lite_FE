import { useQuery } from "@tanstack/react-query";
import { type DeclarationResponse, getDeclaration, getExportFile } from "../../services/pcfExportService";
import { errorStatus } from "./logic";

export { getExportFile };

export const keys = {
  all: ["pcf", "declaration"] as const,
  declaration: (studyId: number) => [...keys.all, studyId] as const,
};

/** The declaration data (format=pdf-data); 404 and 409 are answers, not worth a retry. */
export function useDeclaration(studyId: number | null) {
  return useQuery<DeclarationResponse>({
    queryKey: keys.declaration(studyId ?? 0),
    queryFn: () => getDeclaration(studyId!),
    enabled: studyId !== null,
    retry: (count, err) => {
      const status = errorStatus(err);
      return status !== 404 && status !== 409 && status !== 403 && count < 2;
    },
  });
}
