# Engineering audit: 2026-11-02

Principles: **KISS**, **YAGNI**, **DRY**, **SOLID**, **Testable**.

**Findings:** 1

| Principle | Severity | File | Note |
|-----------|----------|------|------|
| KISS | warn | `src/api/routes.ts` | File has 555 lines (>400): consider splitting |

## Next steps

1. Update `.heyeddi/docs/engineering/architecture.md` if modules changed
2. Add reuse entries before creating new wrappers
3. `append_decision.py` for non-obvious trade-offs
