/**
 * AS-1 · mock /assistant/status and /assistant/chat (ESG-lite src/assistant).
 * The status follows `setAssistantMockStatus`; chat answers with one article
 * unless `setAssistantMockNext` queues an error or another reply. Every chat
 * body is kept for tests (`assistantMockRequests`).
 */
import { http, HttpResponse } from "msw";
import type { AssistantChatReply, AssistantChatRequest, AssistantStatus } from "../../lib/assistant/contracts";

type Next = { status: number; body: unknown };

const state = { enabled: true, configured: true, queue: [] as Next[], requests: [] as AssistantChatRequest[] };

export const ASSISTANT_MOCK_REPLY: AssistantChatReply = {
  reply: "1. Open [Add data](/data/new).\n2. Pick the **site**, category and month, then click **Send**.",
  answered: true,
  sources: [{ id: "add-data-typed", title: "Enter data by typing it in", path: "/data/new" }],
};

export function resetAssistantMocks(): void {
  state.enabled = true;
  state.configured = true;
  state.queue.length = 0;
  state.requests.length = 0;
}

export function setAssistantMockStatus(enabled: boolean, configured = true): void {
  state.enabled = enabled;
  state.configured = configured;
}

/** The next chat answer: a status and body (an error code, or another reply). */
export function setAssistantMockNext(status: number, body: unknown): void {
  state.queue.push({ status, body });
}

export const assistantMockRequests = (): AssistantChatRequest[] => state.requests;

export const assistantHandlers = [
  http.get("*/assistant/status", () => HttpResponse.json<AssistantStatus>({ enabled: state.enabled, configured: state.configured })),
  http.post("*/assistant/chat", async ({ request }) => {
    state.requests.push((await request.json()) as AssistantChatRequest);
    if (!state.enabled) return HttpResponse.json({ code: "AS_OFF", message: "The help assistant isn't turned on for your company." }, { status: 403 });
    const next = state.queue.shift();
    if (next) return HttpResponse.json(next.body as Record<string, unknown>, { status: next.status });
    return HttpResponse.json<AssistantChatReply>(ASSISTANT_MOCK_REPLY);
  }),
];
