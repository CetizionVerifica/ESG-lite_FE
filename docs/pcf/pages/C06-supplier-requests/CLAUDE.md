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
