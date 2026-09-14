# Contact and outreach repair audit

Date: 2026-09-14

## Implemented

1. Fixed Browser Companion context enrichment overwriting a message ID with its contact ID. Approval now keeps the saved message identity.
2. Kept telephone and WhatsApp numbers separate across contact discovery, app channel selectors, extension, readiness and document exports.
3. Added publication or user-confirmation requirements for WhatsApp, backed by database constraints and a draft/status transition guard.
4. Added source-linked public owner contacts without treating reception numbers as owner numbers. Owner phone/email appear in contacts and dossier sections.
5. Improved HTML and structured-data parsing, phone validation, country inference, contact/about/team-page inspection and social-profile link extraction.
6. Added optional Brave public-web source discovery. Candidate search results must still pass business-identity checks before contact extraction.
7. Added contact research refresh and WhatsApp correction controls. A user-marked unavailable number stays unavailable after automatic research.
8. Fixed contact-picker response races and added Facebook to AI channel eligibility.
9. Made clipboard failures non-blocking for extension platform handoff, with accurate feedback.
10. Corrected automatic qualification so failed website checks and unobserved social activity stay unknown.
11. Preserved telephone country prefixes and removed guessed WhatsApp hyperlinks from all dossier sections. Emails and source hyperlinks are included.
12. Added regression tests to CI and installed compatible dependency security patches.
13. Added a dedicated WhatsApp direct links section with source evidence or explicit Not available, preserving Coldingrod styling.

## Verification

- Eleven JavaScript regression tests pass, including unavailable WhatsApp and direct-link export coverage.
- Supabase rollback-only contact evidence, report-grounded outreach and Browser Companion acceptance suites pass.
- New migration passes trial execution and was applied to the linked Supabase project.
- Type checking, lint and the final production rebuild pass, including the export correction.
- Dossier content/hyperlink checks pass using the bundled document runtime. Visual page verification is pending because the bundled renderer cannot find LibreOffice.
- Production dependency audit reports zero vulnerabilities on this run.
- Existing security advisor warnings cover intentionally exposed, permission/token-checked definer RPCs and disabled leaked-password protection. Do not treat these as a clean security audit of the entire product.

## Not claimed complete

- Live platform account availability and actual sends were not tested with real recipients. No real outreach was sent during verification.
- A published WhatsApp number may later become unavailable; publication is not an account-availability guarantee.
- Broader internet research needs BRAVE_SEARCH_API_KEY in the server environment. Known-website research works without it.
- Production OpenAI configuration and fully model-generated variation are not verified by this release; the existing rule-based fallback remains when the provider is absent or fails.
- The final send remains a user action on the destination platform. Fully automatic multi-platform sending is not implemented by this repair.
- Bulk exports use stored information if their best-effort research budget is exhausted. Refresh important leads before export.
- Full roadmap reconciliation, all-account signed-in acceptance, and document visual QA remain outstanding. This repair is not a claim of 100% product completion.
