# TIMELOG - Bible Strong Avatar Lab

> Engineering work log. Times are rounded from observed session timestamps and are provided for
> project traceability, not billing.

## 2026-08-14 - Avatar runtime React v1

| Workstream                                  | Start | End   | Duration | Status   | Evidence                                                                                                                                                                 |
| ------------------------------------------- | ----- | ----- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract and core runtime            | 13:53 | 14:10 | 17 min   | Complete | v1 JSON Schema, bounded parser, Ajv validation, semantic catalog, geometry, scene generation and deterministic playback extracted to `@bible-strong/avatar-core`.        |
| React renderer and consumer hardening       | 14:10 | 14:25 | 15 min   | Complete | Embedded/floating rendering, React 19 controller, SSR portal handoff, drag/keyboard controls, resize constraints, callbacks and direct frame updates validated.          |
| Studio semantic export and reported blocker | 14:25 | 14:39 | 14 min   | Complete | Restored approved bundled keys, removed cascading errors, added targeted local-project clearing and verified a schema-v1 Strobi export with no public opaque references. |
| Export UX and developer guidance            | 14:44 | 14:50 | 6 min    | Complete | Flagged the new runtime menu, distinguished the historical ZIP export, added npm quick start, translations and accessible copy feedback.                                 |
| Runnable package preview and visual polish  | 14:50 | 15:02 | 12 min   | Complete | Added high-contrast syntax coloring and an inline preview rendered by `@bible-strong/avatar-react`, with restartable `idle` playback.                                    |
| Final audit, documentation and archive      | 15:02 | 15:20 | 18 min   | Complete | Updated the implementation status, archived completed specs, recorded verification evidence and prepared the detailed commit.                                            |

**Recorded total: approximately 1 h 22 min.**

### Verification record

- `pnpm check`: 19 test files and 162 tests passed; typecheck, generated engine, package builds and
  production Studio build passed.
- `npm pack --dry-run --json`: 30 allow-listed core files and 10 React files.
- `pnpm packages:smoke`: actual tarballs installed, typechecked and built in a clean non-workspace
  React/Vite consumer.
- Browser checks: semantic playback, embedded/floating rendering, dragging, mobile overflow,
  runtime export recovery, formatted JSON copy, syntax coloring and live package preview verified.
- Known unrelated local-preview noise: Vercel Analytics and Speed Insights scripts return 404 when
  served outside Vercel.
