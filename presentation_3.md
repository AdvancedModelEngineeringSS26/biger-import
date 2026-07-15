---
marp: true
---

# SQL → ER Converter
### Final presentation

---

## Agenda

1. The feature
2. Pipeline architecture
3. Phase 1 — parsing & dialects
4. Phase 2 — heuristics
5. Phase 3 — serialization
6. Workflow & UX
7. Testing
8. Demo

---

## 1 · The feature

Import an existing SQL schema into a bigER diagram.

**Input:** a `.sql` file of `CREATE TABLE` statements
**Output:** a bigER `.er` diagram

- Tables → entities
- Columns → attributes (type, key, optional)
- Foreign keys → relationships with cardinality
- Structure (junctions, inheritance, weak entities) → inferred automatically

One command — **ER: Import** — across **11 SQL dialects**.

---

## 2 · Pipeline architecture

Three phases, each a separate module — testable and changeable in isolation.

```
SQL text
  → [sql-parser]      → SchemaModel    (faithful SQL, dialect-agnostic)
  → [schema-analyzer] → ErModel        (all heuristics live here)
  → [er-serializer]   → .er text
```

| Phase | Responsibility | Knows about |
|---|---|---|
| Parser | AST → typed SQL model | dialects, `node-sql-parser` |
| Analyzer | SQL model → ER model | ER modeling rules only |
| Serializer | ER model → text | bigER `.er` syntax only |

> One concern per phase. Heuristics never leak into parsing or output.

---

## 3 · Phase 1 — SQL Parser

**Input:** raw SQL + dialect → **Output:** `SchemaModel`

Wraps `node-sql-parser` — the **only** place that touches the raw AST. Every dialect's quirks are normalized here, so downstream phases never branch on dialect.

The `SchemaModel` captures everything DDL can express:

- Table name + optional schema prefix
- Per column: type (length, scale), nullability, PK / UNIQUE / AUTO_INCREMENT, default, comment
- `PRIMARY KEY` (composite, named) · `FOREIGN KEY` (with `ON DELETE` / `ON UPDATE`)
- `UNIQUE` and `CHECK` constraints

---

## 3 · 11 dialects, one ER model

**MySQL · PostgreSQL · MariaDB · SQLite · Hive · DB2 · Redshift · Snowflake · Flink SQL · T-SQL · BigQuery**

The same logical schema → the same ER model, whatever the source dialect.

| Limitation | Dialect(s) | Why |
|---|---|---|
| No `FOREIGN KEY` | T-SQL, BigQuery | Upstream parser error on FK clauses |
| Non-portable types | BigQuery | Wants `INT64` / `STRING`, not `INT` / `VARCHAR` |
| Single-line only | Flink SQL | Parser rejects newlines in a statement |

> Limitations are surfaced in the dialect picker and the docs.

---

## 4 · Phase 2 — baseline mapping

**Input:** `SchemaModel` → **Output:** `ErModel`. All heuristics live here.

Always applied:

| Aspect | Rule |
|---|---|
| Entity name | table name → PascalCase (`order_items` → `OrderItems`) |
| Attribute | one per column, `name: TYPE` |
| `key` modifier | column in the primary key (inline + table-level unified) |
| `optional` modifier | column explicitly nullable, not in PK |
| Relationship per FK | `{Parent} [1] -> {Child} [card]` |
| Unresolved FK | dropped if referenced table is absent |

---

## 4 · Phase 2 — structural heuristics

On top of the baseline, the analyzer infers ER structure from DDL clues:

| Heuristic | Detects | Produces |
|---|---|---|
| Junction → M:N | 2 FKs, composite PK, all-FK columns | One M:N relationship, no entity |
| ISA / inheritance | Entire PK = a FK | `extends Parent`, no relationship |
| Weak entity | FK ⊂ PK + discriminator | `weak entity` + `partial_key` |
| Cardinality | nullable + UNIQUE | `1` / `0..1` / `1..N` / `0..N` |
| Self-reference | FK to own table | Role from column (`manager_id` → `Manager`) |

---

## 4 · Classified once, deterministically

A table matches **at most one** structural shape — evaluated in order:

> **Junction → ISA → Weak → Plain entity**

The shapes overlap (a junction's FKs look weak; a weak entity's owner FK looks junction-like). Classifying **once, in precedence order** keeps the result deterministic, and entity + relationship generation can never disagree.

> Best-effort inference from DDL alone — a sensible default a human can refine, not a guaranteed reconstruction.

---

## 5 · Phase 3 — ER Serializer

**Input:** `ErModel` → **Output:** `.er` text. Pure string transformation, no logic.

```
erdiagram ImportedFromSql
notation = uml

entity Customer {
    id: INT key
    email: VARCHAR(255)
}

entity Orders {
    id: INT key
    customer_id: INT
}

relationship CustomerOrders {
    Customer [1] -> Orders [1..N]
}
```

---

## 6 · Workflow & UX

Run **ER: Import** directly on a `.sql` file:

- Generates a new `.er` next to it: `schema.sql` → `schema.er`
- Never overwrites — collisions auto-number: `schema1.er`, `schema2.er`, …
- Old `.er`-first flow (file dialog → overwrite) still works


---

## 7 · Testing

**141 tests**, 4 files, green on Ubuntu · macOS · Windows (Node 22, via CI).

| File | Phase | Tests |
|---|---|---|
| `sql-parser.test.ts` | 1 | 44 — per-dialect tests for all 11 |
| `schema-analyzer.test.ts` | 2 | 43 — every heuristic + precedence + negatives |
| `er-serializer.test.ts` | 3 | 19 — incl. `weak` / `extends` / `partial_key` |
| `pipeline.test.ts` | all | 35 — end-to-end SQL → `.er` |

Each phase is tested in isolation; **Vitest** runs TS + ESM natively. Negative tests assert each heuristic *declines* to fire at its boundaries.

---

## 8 · Demo

---

## Summary

- **3-phase pipeline** — parse → analyze → serialize
- **11 dialects** normalized into one model
- **10 heuristics**, classified deterministically
- **`.sql`-first workflow**, non-destructive
- **141 tests** + CI, fully documented in `docs/`
