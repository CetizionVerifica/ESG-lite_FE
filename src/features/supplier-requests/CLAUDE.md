# C06 · Supplier data requests (phase 3)

> Blueprint spec. Route `/products/suppliers`. Role: **Manager**. External suppliers get a tokenised upload link (no account).
> Depends on: E1 `SupplierRequest`, E2 parse-declaration, existing email service (`src/services/emailService.ts`) and notification queue.

## Job to be done
"Replace generic factors for our biggest materials with our suppliers' own footprints, and track who has answered."

## Flow
1. From C03 hotspots or C02 materials, "Ask supplier" on an input → modal with supplier email, material, declared unit wanted, due date.
2. Supplier opens the link: uploads a PCF/EPD PDF or a PACT JSON, or types value + boundary + reference period.
3. E2 reads the PDF; the manager reviews (AI chips), accepts → a company-scoped MaterialFactor with licence `supplier`, linked to the input; primary data share rises.
4. Table: Supplier | Material | Requested | Due | Status (Sent, Opened, Received, Accepted, Expired) | Value | Validity.

## Rules
- Sending email to an external address is an outward action: the modal shows the exact message and requires an explicit "Send".
- A supplier value with a different boundary (e.g. cradle-to-grave) is flagged and not accepted silently.

## Build notes (C06 3/4, 2026-10-13)
- Route `supplier-requests` at `/products/suppliers` (Manager), registered in this folder's `routes.tsx`; a static segment, so it outranks `/products/:productId`. Deep links: `?request=<id>` opens a request, `?new=1&study=<id>&input=<id>` opens "Ask supplier" on a line (what C03 hotspots and C02 lines link to, part 4/4), `?status=` filters.
- Data: ESG-lite `/pcf/supplier-requests` (ESG-lite #109) through `src/services/supplierRequestService.ts`; the AI read is `POST /v1/pcf/parse-declaration` (python_AI_service #27) through `pcfAiService.parseDeclaration`, fed with the file downloaded from ESG-lite.
- "Ask supplier" is a Drawer, not a Modal: the form plus the full message outgrows `src/ui` Modal (short forms only). The message comes from the backend preview endpoint, so what is shown is what is sent; only the explicit Send button creates and sends the request.
- Mail mode: the backend defaults to a dev sink. The page says so, and the link is shown once in the drawer with a Copy button (also after "Send again").
- A different boundary is shown as a warning badge on the answer and blocks Accept until the manager ticks "Accept it anyway"; the backend refuses it otherwise (409 `boundary_mismatch`). AI chips show value, confidence and the reason on hover; under 60% they use the warn tint. The read fills the form only where the file says something.
- Statuses: Sent, Opened, Received, Accepted, Rejected, Expired (the spec's five plus Rejected, which the backend records).
- Not in this part: the supplier's upload page `/supplier/:token` and the entry points from C03 and C02 (part 4/4).
