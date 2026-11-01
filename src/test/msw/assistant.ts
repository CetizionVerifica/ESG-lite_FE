/**
 * AS-1 · mock /assistant/status, /assistant/chat and /assistant/feedback
 * (ESG-lite src/assistant). The status follows `setAssistantMockStatus`; chat
 * answers with one article unless `setAssistantMockNext` queues an error or
 * another reply. Every chat and feedback body is kept for tests
 * (`assistantMockRequests`, `assistantMockFeedback`).
 */
import { delay, http, HttpResponse } from "msw";
import type { AssistantChatReply, AssistantChatRequest, AssistantStatus } from "../../lib/assistant/contracts";

type Next = { status: number; body: unknown };

const state = { enabled: true, configured: true, files: false, delayMs: 0, queue: [] as Next[], requests: [] as AssistantChatRequest[], feedback: [] as unknown[] };

export const ASSISTANT_MOCK_REPLY: AssistantChatReply = {
  reply: "1. Open [Add data](/data/new).\n2. Pick the **site**, category and month, then click **Send**.",
  answered: true,
  sources: [{ id: "add-data-typed", title: "Enter data by typing it in", path: "/data/new" }],
  followups: ["How do I fix a rejected entry?"],
  call_id: 41,
};

export function resetAssistantMocks(): void {
  state.enabled = true;
  state.configured = true;
  state.files = false;
  state.delayMs = 0;
  state.queue.length = 0;
  state.requests.length = 0;
  state.feedback.length = 0;
}

export function setAssistantMockStatus(enabled: boolean, configured = true, files = false): void {
  state.enabled = enabled;
  state.configured = configured;
  state.files = files;
}

/** The next chat answer: a status and body (an error code, or another reply). */
export function setAssistantMockNext(status: number, body: unknown): void {
  state.queue.push({ status, body });
}

/** Chat answers take this long, for a test that acts while it's waiting. */
export function setAssistantMockDelay(ms: number): void {
  state.delayMs = ms;
}

export const assistantMockRequests = (): AssistantChatRequest[] => state.requests;
export const assistantMockFeedback = (): unknown[] => state.feedback;

export const assistantHandlers = [
  http.get("*/assistant/status", () => HttpResponse.json<AssistantStatus>({ enabled: state.enabled, configured: state.configured, files: state.files })),
  http.post("*/assistant/chat", async ({ request }) => {
    state.requests.push((await request.json()) as AssistantChatRequest);
    if (state.delayMs) await delay(state.delayMs);
    if (!state.enabled) return HttpResponse.json({ code: "AS_OFF", message: "The help assistant isn't turned on for your company." }, { status: 403 });
    const next = state.queue.shift();
    if (next) return HttpResponse.json(next.body as Record<string, unknown>, { status: next.status });
    return HttpResponse.json<AssistantChatReply>(ASSISTANT_MOCK_REPLY);
  }),
  http.post("*/assistant/feedback", async ({ request }) => {
    state.feedback.push(await request.json());
    return HttpResponse.json({ ok: true });
  }),
];
