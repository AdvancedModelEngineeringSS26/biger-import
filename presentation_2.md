---
marp: true
---

# SQL → ER Converter
### Interim 2 — Three-phase pipeline & unit testing

---

## Agenda

1. From monolith to three phases
2. The three phases
3. Testing strategy
4. CI integration
5. Next steps

---

## 1 · From monolith to three phases

The original `sql-import-service.ts` mixed three concerns in one file:

- AST traversal and SQL structure extraction
- ER modeling heuristics (naming, cardinalities, relationships)
- `.er` text generation

**What we changed:**

| Before | After |
|---|---|
| All mixed in 1 file | 3 focused modules + thin orchestrator |
| Heuristics tangled with parsing | Heuristics isolated in one place |
| Nothing independently testable | Each phase testable in isolation |

---

## 2 · The three phases

```
SQL text
  → [sql-parser]      → SchemaModel    (faithful SQL representation)
  → [schema-analyzer] → ErModel        (ER modeling concepts)
  → [er-serializer]   → .er text
```

---

### Phase 1 — SQL Parser (`sql-parser.ts`)

**Input:** raw SQL string + dialect → **Output:** `SchemaModel`

Wraps `node-sql-parser`. The only place in the codebase that touches the raw AST.

Captures everything DDL can express:

- Table names and optional schema prefix
- Per column: name, data type (length, scale), nullability, PK/UNIQUE/AUTO_INCREMENT flags, default value
- Table-level `PRIMARY KEY` (composite, named)
- `FOREIGN KEY` with `ON DELETE` / `ON UPDATE` actions
- `UNIQUE` and `CHECK` constraints

Fields not yet used by downstream phases are still captured for future heuristics.

---

### Phase 2 — Schema Analyzer (`schema-analyzer.ts`)

**Input:** `SchemaModel` → **Output:** `ErModel`

All ER modeling heuristics live here and only here:

| Heuristic | Example |
|---|---|
| Entity naming | `order_item` → `OrderItem` (PascalCase) |
| PK unification | Inline + table-level constraints merged |
| Attribute modifier | PK column → `key`, nullable → `optional` |
| Relationship cardinality | `[1] → [0..N]` per FK |
| Unresolved FK | Silently filtered if referenced table is absent |

---

### Phase 3 — ER Serializer (`er-serializer.ts`)

**Input:** `ErModel` → **Output:** `.er` text

Pure string transformation. No logic, no decisions.

```
erdiagram ImportedFromSql
notation = uml

entity Order {
    id: INT key
    amount: DECIMAL(10, 2)
    customer_id: INT
}

relationship CustomerOrder {
    Customer [1] -> Order [0..N]
}
```

---

## 3 · Testing strategy

**Chosen runner: Vitest**

Vitest runs TypeScript + ESM natively, which matches the language-server's module setup exactly. It needs no extra configuration beyond a simple config file.

---

### Test isolation

Each test file is completely independent:

| File | Phase | Input source |
|---|---|---|
| `sql-parser.test.ts` | 1 | Raw SQL strings |
| `schema-analyzer.test.ts` | 2 | Hand-built `SchemaModel` objects |
| `er-serializer.test.ts` | 3 | Hand-built `ErModel` objects |

Phases 2 and 3 never call Phase 1 — their inputs are constructed directly. A bug in the parser cannot cascade into analyzer or serializer test results.

---

### Coverage breakdown

**60 tests total, 3 files**

`sql-parser.test.ts` — 26 tests
Table parsing, column data types, nullability, PK/UNIQUE/AUTO_INCREMENT/DEFAULT, table-level PK (composite, named), FK (named, ON DELETE / ON UPDATE), UNIQUE and CHECK constraints, both dialects

`schema-analyzer.test.ts` — 20 tests
Entity name derivation, attribute modifiers (key / optional / none), data type formatting, relationship direction and cardinality, FK to unknown table filtered, two FKs from one table, empty schema

`er-serializer.test.ts` — 14 tests
Header, entity blocks, attribute modifier variants, attribute without data type, relationship body, entity-before-relationship ordering, empty model

---

## 4 · CI integration

Tests run automatically on every push and pull request to `main`, on all three platforms:

```yaml
- name: Install dependencies & build extension
  run: yarn
- name: Run unit tests
  run: yarn --cwd packages/language-server test
```

Matrix: **Ubuntu · macOS · Windows**, Node 22

---

## 5 · Next steps

Possible heuristics in `schema-analyzer.ts` (all data already available in `SchemaModel`):

| Heuristic | Condition | Current → Proposed |
|---|---|---|
| **M:N via junction table** | Table whose PK = all FK columns | Entity → M:N relationship |
| **1:1 via UNIQUE FK** | FK source columns covered by UNIQUE | `[0..N]` → `[0..1]` or `[1]` |
| **Nullable FK cardinality** | FK source column is nullable | `[0..N]` stays; NOT NULL → `[1..N]` |

---

| Heuristic | Condition | Current → Proposed |
|---|---|---|
| **ISA / inheritance** | Table's entire PK is also a FK | Relationship → `extends` clause |
| **Self-referencing FK** | FK references its own table | Better name from column hint |
