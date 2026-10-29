// AS-1 · the help assistant's requests (TanStack Query). The status decides
// whether the top bar shows "Ask ESGLite"; the client switch invalidates it.
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "../../api/axios";
import type { AssistantChatReply, AssistantChatRequest, AssistantStatus } from "./contracts";

export const assistantStatusKey = ["assistant", "status"] as const;

export async function getAssistantStatus(): Promise<AssistantStatus> {
  const { data } = await api.get("/assistant/status");
  return { enabled: data?.enabled === true, configured: data?.configured === true };
}

export async function postAssistantChat(req: AssistantChatRequest): Promise<AssistantChatReply> {
  const { data } = await api.post("/assistant/chat", req);
  return data;
}

/** Off (not an error) when the server has no /assistant route yet or the call fails. */
export function useAssistantStatus(signedIn: boolean) {
  return useQuery({
    queryKey: assistantStatusKey,
    queryFn: () => getAssistantStatus().catch(() => ({ enabled: false, configured: false })),
    enabled: signedIn,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useAssistantChat() {
  return useMutation({ mutationFn: postAssistantChat });
}
