# AGENTS.md

## Project overview

This repo is for CLC billing automation.

The current app is a browser-based billing/payment workflow tool. The project may expand to include QuickBooks Online automation, payment reconciliation, ERA/table parsing, invoice preparation, validation, and reporting.

Keep the scope centered on automating CLC billing workflows, not building a generic billing product.

## Working style

- Be direct and practical.
- Do not over-engineer small changes.
- Prefer the smallest safe change that solves the current problem.
- Do not rewrite unrelated code.
- Do not introduce new frameworks or dependencies unless clearly justified.
- When uncertain, inspect the existing code first instead of guessing.
- Preserve existing naming and structure unless there is a clear reason to change it.
- Explain meaningful tradeoffs briefly, then make a recommendation.

## Architecture expectations

- Keep business rules separate from UI code when practical.
- Tax, payer, therapist, invoice, and reconciliation rules should live in shared logic, not scattered across components.
- UI components should mostly handle presentation, user actions, and state wiring.
- Parsing, normalization, validation, and calculations should be testable without the browser UI.
- Future QuickBooks automation should be isolated from the current extension UI, likely under its own app/module/folder.
- Shared billing rules should be reusable by both the extension and QuickBooks automation.