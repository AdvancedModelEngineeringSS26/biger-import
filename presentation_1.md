---
marp: true
---

# SQL → ER Converter
### Status update & architectural decisions

---

## Agenda

1. Parser decision
2. What's working today
3. Proposed pipeline architecture
4. Three directions under evaluation
5. Questions

---

## 1 · Parser decision

> **Chosen: `node-sql-parser`**
> Evaluated: `node-sql-parser`, `sql-ddl-to-json-schema`, `pgsql-parser`

| Criterion | Why it mattered | Decision |
|---|---|---|
| No native binaries | Must bundle cleanly with esbuild | Pure JavaScript |
| Dialect support | MySQL, PostgreSQL, SQLite from one lib | Multi-dialect |
| DDL coverage | Inline PK, table-level PK, FK with `reference_definition` | Full coverage |

---

## 2 · Already done

**Input:** `CREATE TABLE` statements
**Output:** ER entities with columns, keys, and relationships

- Table name → PascalCase → ER entity name
- Columns → name, data type (with length / scale), optionality
- Primary keys → detected inline (`id INT PRIMARY KEY`) and as table-level constraints
- Foreign keys → ER relationship with `[1] -> [0..N]` cardinality
- Basic error handling for malformed input

---

## 3 · Proposed pipeline architecture

```
SQL text
  → [parser]     → SchemaModel   (pure SQL representation)
  → [analyzer]   → ErModel       (heuristics applied here)
  → [serializer] → ER text
```

**Why this structure?**

Heuristics live exclusively in the analyzer, making each phase independently testable. This also directly satisfies the golden-file and unit test requirements — each stage can be exercised in isolation.

---

## 4 · Three directions under evaluation

---

### Option A · Stay on `node-sql-parser` + typed intermediate model

Keep the current parser, but separate the importer into clear stages: SQL parsing, SQL analysis, and ER generation. In practice, this means replacing the current direct AST → text flow with typed `SchemaModel` and `ErModel` interfaces.

**Pros**
- Best fit with the current code — `node-sql-parser` is already integrated
- Lowest-risk refactor: improves structure without replacing working parts
- Makes heuristics testable in isolation (naming, cardinalities, relationship rules)

**Cons**
- We still have to do the manual AST traversal
- Dialect differences and PostgreSQL reliability still need validation

---

### Option B · Switch to `sql-ddl-to-json-schema`

Replace the parser front-end with a library that already produces structured DDL output. This would reduce AST-specific extraction code, but it only simplifies the parsing stage — the ER mapping rules would still stay in our analyzer.

**Pros**
- Cleaner parser output for tables, columns, PKs, and FKs
- Less parser-specific boilerplate in the importer

**Cons**
- Narrower dialect story than `node-sql-parser` (no PostgreSQL)
- Gives us less control over unusual SQL edge cases
- Still requires a translation layer into bigER concepts

---

### Option C · Use Langium's in-memory AST as the serialization target

Use the generated Langium ER AST as the target representation instead of building `.er` text directly. This aligns the importer with the project grammar and makes the generated model structurally match what the language server already understands.

**Pros**
- Strongest long-term alignment with the ER grammar
- Better type safety for entities, relationships, attributes, and references
- Reduces the risk of importer output drifting away from the DSL structure

**Cons**
- More upfront work than A
- Cross-references and text generation still need explicit handling
- Not the fastest route to stabilizing the current importer

---

## 5 · Open questions

---

### Q1 · Build errors on Node.js

Failed automated tests on GitHub. We think it is olds version of Node.js

---

### Q2 · Multi-dialect parsing strategy

| Approach | How it works | Trade-off |
|---|---|---|
| Explicit parameter | Caller passes `{ dialect: "postgresql" }` | Predictable, but requires caller knowledge |
| Fallback chain | Try each dialect in sequence, catch errors | Ergonomic, but may silently pick the wrong dialect |



---

### Q3 · Where to add documentation
For now we added into `/docs`.
