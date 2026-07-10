# ContractView Landing Page Design

## Goal

Replace the starter Next.js homepage with a compact ContractView landing page similar in structure to `https://gridd01.vercel.app/`, using the application's existing blue, white, and zinc theme. The page should introduce ContractView as a contract and tradebook operations console, not as a generic template or marketing splash page.

## Approved Direction

Use the **Precise SaaS** direction:

- Bright, clean, and compact.
- Similar page rhythm to Gridd: navigation, hero, two calls to action, a technical workflow strip, feature cards, and footer.
- Uses ContractView's current primary blue and existing sharp-corner theme.
- Copy focuses on contracts, tradebooks, evidence, exceptions, reconciliation, and audit readiness.

## Page Structure

1. Header
   - Brand: `ContractView`
   - Links: `Features`, `Workflow`, `Sign in`
   - Keep it light and compact, with the brand visible in the first viewport.

2. Hero
   - Headline: `Contracts, trades, and evidence in one calm view`
   - Supporting copy: `A focused operations console for reviewing contract metadata, tradebook rows, exceptions, and audit context without spreadsheet drift.`
   - Primary CTA: `Open Console`
   - Secondary CTA: `View Workflow`

3. Workflow Strip
   - A command/code-inspired strip, echoing Gridd's install block but adapted to the application domain.
   - Example theme: import a tradebook, normalize rows, match contracts, review exceptions, export evidence.

4. Product Preview
   - A lightweight static console preview showing representative rows such as:
     - `Master Services Agreement` with `Matched` state and `98%`
     - `Q4 Tradebook Upload` with `Review` state and `14`
     - `Pricing Schedule` with `Clean` state and `0`
   - This should feel like an operational surface, not a decorative illustration.

5. Features
   - Six compact feature cards:
     - Contract metadata review
     - Tradebook reconciliation
     - Exception queues
     - Audit-ready evidence
     - Import/export workflow
     - Role-aware review

6. Footer
   - Brand plus concise positioning: contract and tradebook operations console.
   - Quick links matching the header.

## Visual System

- Use the existing theme variables from `app/globals.css`, especially the blue `--primary`.
- Keep the background mostly white/zinc with subtle blue accents.
- Avoid oversized hero art, heavy gradients, or generic decorative shapes.
- Keep cards at sharp or small-radius corners to match the current `--radius: 0` light theme.
- Use responsive constraints so the hero, CTAs, preview, and cards do not overflow on mobile.
- Use the app's existing font setup; do not add new font dependencies for this pass.

## Technical Scope

- Primary implementation target: `app/page.tsx`.
- Metadata update in `app/layout.tsx`:
  - Title: `ContractView`
  - Description: `Contract and tradebook operations console.`
- No database, authentication, or Clerk behavior changes.
- No new runtime dependencies.
- The page should remain static-friendly.

## Testing And Verification

- Run the narrowest available static checks after implementation:
  - `bun run lint`
  - `bun run build` if environment variables and local setup allow it
- Start the local dev server and inspect the landing page visually in the browser.
- Check desktop and mobile viewport behavior for overflow, overlapping text, and CTA/card layout.

## Out Of Scope

- Building the authenticated application console.
- Wiring CTAs to real authenticated routes beyond simple links or anchors.
- Adding screenshots, videos, or generated images.
- Changing Clerk provider setup.
- Changing Prisma, database schema, or deployment scripts.
