// AS-1 · the help assistant's requests (TanStack Query). The status decides
// whether the "Ask ESGLite" bubble shows; the client switches invalidate it.
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "../../api/axios";
import type { AssistantChatReply, AssistantChatRequest, AssistantStatus } from "./contracts";

export const assistantStatusKey = ["assistant", "status"] as const;

export async function getAssistantStatus(): Promise<AssistantStatus> {
  const { data } = await api.get("/assistant/status");
  return { enabled: data?.enabled === true, configured: data?.configured === true, files: data?.files === true, work: data?.work === true };
}

export async function postAssistantChat(req: AssistantChatRequest): Promise<AssistantChatReply> {
  const { data } = await api.post("/assistant/chat", req);
  return data;
}

export async function postAssistantFeedback(body: { call_id: number; helpful: boolean }): Promise<void> {
  await api.post("/assistant/feedback", body);
}

/** Off (not an error) when the server has no /assistant route yet or the call fails. */
export function useAssistantStatus(signedIn: boolean) {
  return useQuery({
    queryKey: assistantStatusKey,
    queryFn: () => getAssistantStatus().catch(() => ({ enabled: false, configured: false, files: false, work: false })),
    enabled: signedIn,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useAssistantChat() {
  return useMutation({ mutationFn: postAssistantChat });
}

export function useAssistantFeedback() {
  return useMutation({ mutationFn: postAssistantFeedback });
}
