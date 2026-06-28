# SQL Import — Feature Documentation

This document describes the SQL import feature of bigER: what it does, how to use it, and how it is implemented internally.

---

## What It Does

The SQL import feature reads a `.sql` file containing `CREATE TABLE` statements and converts it into a bigER `.er` diagram. Each table becomes an entity, column definitions become attributes, and foreign key constraints become relationships.

### Supported dialects

| Dialect | Entities & columns | Relationships | Notes |
|---|---|---|---|
| MySQL | ✓ | ✓ | Full support |
| PostgreSQL | ✓ | ✓ | Full support |
| MariaDB | ✓ | ✓ | MySQL fork, identical behaviour |
| SQLite | ✓ | ✓ | Full support |
| Hive | ✓ | ✓ | Native types: `BIGINT`, `DOUBLE`, `STRING`, `TIMESTAMP` |
| IBM DB2 | ✓ | ✓ | Full support |
| Amazon Redshift | ✓ | ✓ | Full support |
| Snowflake | ✓ | ✓ | Alpha support in node-sql-parser |
| Apache Flink SQL | ✓ | ✓ | Single-line SQL only; the underlying parser does not accept newlines |
| T-SQL / SQL Server | ✓ | ✗ | `FOREIGN KEY` clauses cause a parse error in the underlying library; import SQL files that have FK constraints removed |
| BigQuery | ✓ | ✗ | `FOREIGN KEY` clauses cause a parse error; BigQuery does not enforce FKs anyway |

---

## How to Use It

There are two ways to run the import, depending on which file is active. Both use the same command — **ER: Import** — available from the command palette and the editor context menu (and, for `.sql` files, the editor title bar icon).

### From a `.sql` file (recommended)

1. Open a `.sql` file in VS Code.
2. Run **ER: Import** and select the SQL dialect.
3. A new `.er` file is created **next to the SQL file, with the same base name** (`schema.sql` → `schema.er`) and opened in the editor.

If a file with that name already exists, a number is appended so nothing is overwritten: `schema.er` → `schema1.er` → `schema2.er`, and so on.

### From a `.er` file

1. Open (or create) a `.er` file in VS Code.
2. Run **ER: Import** and select the SQL dialect.
3. Pick the `.sql` file using the file dialog.

The contents of the active `.er` file are **replaced** with the generated diagram.

> Running the command on any other file type shows an error. The command only appears for `.sql` and `.er` files (`editorLangId == 'sql' || editorLangId == 'entity-relationship'`).

### Examples

The [`examples/dialects/`](../examples/dialects/) folder contains nine `.sql` files — one per FK-capable dialect, each written in that dialect's idiomatic style — that all import to the **same** ER model. See [`examples/dialect-demo.md`](../examples/dialect-demo.md) for a walkthrough.

The [`examples/heuristics/`](../examples/heuristics/) folder contains one focused `.sql` file per modeling heuristic (junction, ISA, weak entity, cardinality, self-reference, name collision), plus a `generic.sql` that exercises them all at once — see [Implemented Heuristics](#implemented-heuristics) for the rules.

---

## Pipeline Architecture

The import is implemented as a three-phase pipeline inside the language server:

```
SQL text
  → [sql-parser]      → SchemaModel    (faithful SQL representation)
  → [schema-analyzer] → ErModel        (ER modeling concepts)
  → [er-serializer]   → .er text
```

Each phase is a separate module and can be read, tested, and changed independently.

### Phase 1 — SQL Parser (`sql-parser.ts`)

**Input:** raw SQL string + dialect  
**Output:** `SchemaModel`

Calls `node-sql-parser` to produce an AST, then traverses it into a fully-typed `SchemaModel`. This is the only place in the codebase that touches the raw parser output. All dialect-specific AST quirks (differences in how MySQL and PostgreSQL represent table names, column references, and foreign key structures) are normalised here so downstream phases never have to think about them.

The `SchemaModel` is intentionally comprehensive — it captures everything DDL can express:

- Table name and optional schema prefix
- Per column: name, data type (with length and scale), nullability, inline PK/UNIQUE flags, auto-increment, default value, comment
- Table-level `PRIMARY KEY` constraint (with constraint name and column list, supporting composite PKs)
- `FOREIGN KEY` constraints (constraint name, source columns, referenced table and columns, `ON DELETE` / `ON UPDATE` actions)
- `UNIQUE` constraints (constraint name, column list)
- `CHECK` constraints (constraint name)

Fields that the current analyzer does not yet use are still captured so future phases can use them without touching this layer.

### Phase 2 — Schema Analyzer (`schema-analyzer.ts`)

**Input:** `SchemaModel`  
**Output:** `ErModel`

Applies all modeling heuristics to translate SQL concepts into ER concepts. This is the right place to add or change heuristics — the other phases do not contain any.

Every table is classified exactly once (`classifyTable`), and the classification drives both entity and relationship generation. The heuristics range from a baseline column/PK/FK mapping to structural inferences (junction tables, ISA, weak entities, cardinality, self-reference naming).

See [Implemented Heuristics](#implemented-heuristics) below for the full rules, examples, caveats, and precedence.

### Phase 3 — ER Serializer (`er-serializer.ts`)

**Input:** `ErModel`  
**Output:** `.er` text

Converts the `ErModel` into the bigER textual syntax. Pure string transformation with no logic. It renders the structural markers the analyzer produces — `weak entity`, `entity … extends …`, the `partial_key` attribute modifier, and `weak relationship`. The output always starts with:

```
erdiagram ImportedFromSql
notation = uml
```

---

## Request/Response Protocol

The import uses a custom LSP request so the VS Code extension can delegate the conversion work to the language server process.

| | |
|---|---|
| Request method | `biger/importSql` |
| Defined in | `packages/common/src/import/protocol.ts` |
| Parameters | `erDocumentUri`, `sqlDocumentUri`, `sqlContent` (string), `dialect` |
| Response | `erContent` (string) on success; `error` (string) on failure |

All file I/O stays on the extension side; the language server is a pure function from `sqlContent` + `dialect` to `erContent`. The extension reads the SQL text, sends it as a plain string, and then either writes the returned `erContent` to a new `.er` file (SQL-first path) or replaces the active document (ER-first path).

---

## Data Models

### `SchemaModel` — SQL layer

```
SchemaModel
└─ SchemaTable[]
   ├─ name, schema?
   ├─ SchemaColumn[]        name, dataType, nullable, isPrimaryKey, isUnique,
   │                        autoIncrement, defaultValue?, comment?
   ├─ SchemaPrimaryKey?     constraintName?, columns[]
   ├─ SchemaForeignKey[]    constraintName?, sourceColumns[], referencedTable,
   │                        referencedSchema?, referencedColumns[], onDelete?, onUpdate?
   ├─ SchemaUniqueConstraint[]   constraintName?, columns[]
   └─ SchemaCheckConstraint[]    constraintName?
```

### `ErModel` — ER layer

```
ErModel
├─ ErEntity[]          name (PascalCase), weak?, extends?, ErAttribute[]
│                          name, dataType?, modifier? (key | partial_key | optional)
└─ ErRelationship[]    name, leftEntity, leftCardinality,
                       rightEntity, rightCardinality, kind, weak?
```

---

## File Map

| File | Package | Role |
|---|---|---|
| `src/import/sql-parser.ts` | `language-server` | AST → SchemaModel |
| `src/import/schema-model.ts` | `language-server` | SchemaModel type definitions |
| `src/import/schema-analyzer.ts` | `language-server` | SchemaModel → ErModel (heuristics) |
| `src/import/er-model.ts` | `language-server` | ErModel type definitions |
| `src/import/er-serializer.ts` | `language-server` | ErModel → .er text |
| `src/import/sql-import-service.ts` | `language-server` | Pipeline orchestrator |
| `src/import/import-request-handler.ts` | `language-server` | LSP request registration |
| `src/import/import-command.ts` | `extension` | VS Code command; dialect picker; SQL-first path (creates a new `.er` file beside the SQL file, auto-numbering on name collision) and ER-first path (file dialog + overwrite active document) |
| `src/import/protocol.ts` | `common` | Shared LSP request/response types |

---

## Testing

Unit tests live in `packages/language-server/test/import/`. The test runner is **Vitest** (ESM-native, TypeScript-first, no transpile config required).

### Running the tests

```bash
# from packages/language-server
yarn test          # run once
yarn test:watch    # watch mode
```

Or target a single file:

```bash
yarn vitest run test/import/sql-parser.test.ts
```

### Test files

| File | Phase tested | What it covers |
|---|---|---|
| `test/import/sql-parser.test.ts` | Phase 1 | Table name parsing, column data types (with length/scale), nullability, inline PK / UNIQUE / AUTO_INCREMENT / DEFAULT, table-level PK constraint (named, composite), FOREIGN KEY (named, ON DELETE / ON UPDATE), UNIQUE and CHECK constraints; dialect-specific tests for all 11 supported dialects (including Redshift column-name shape, and T-SQL / BigQuery FK-throws assertions) |
| `test/import/schema-analyzer.test.ts` | Phase 2 | Entity name derivation (snake_case → PascalCase), attribute modifiers (key / partial_key / optional / none), data type formatting, relationship creation (left/right entity, kind, cardinality), and every structural heuristic below: junction → M2M, ISA `extends`, weak entity, cardinality inference (nullable + UNIQUE), self-referencing naming, and the precedence between them; FK to unknown table filtered out, two FKs from one table, empty schema |
| `test/import/er-serializer.test.ts` | Phase 3 | Header, entity blocks with all modifier variants (incl. `partial_key`), `weak entity`, `entity … extends …`, `weak relationship`, attribute without data type, relationship body with cardinality and arrow symbol, entity-before-relationship ordering, multiple entities/relationships, empty model |
| `test/import/pipeline.test.ts` | All phases | End-to-end SQL → ER DSL: header, realistic blog schema, junction (`OrderItem`) → M2M, ISA `extends`, self-referencing `Employee`, and the `SqlImportService` happy/error paths |

Each test file is fully independent — Phase 2 and Phase 3 tests construct their input data directly without calling earlier phases.

---

## Implemented Heuristics

Phase 2 (`analyzeSchema` in `schema-analyzer.ts`) turns the raw `SchemaModel` into an `ErModel` by
applying the structural heuristics below. They are **best-effort inferences from the DDL alone** — see
[Global limitations](#global-limitations-what-the-heuristics-cannot-do) for what they fundamentally cannot do, and [Precedence](#precedence) for how they interact.

Every table is classified exactly once (`classifyTable`), and the classification drives both entity and
relationship generation so the two never disagree (e.g. a junction table is never emitted both as an
entity and as a relationship).

### Baseline mapping (always applied)

| Aspect | Rule |
|---|---|
| Entity name | SQL table name → PascalCase (`order_items` → `OrderItems`); leading digit prefixed with `_`; non-word chars become `_` |
| Attribute | one per column, `name: TYPE` |
| Data type | `typeName`, plus `(length)` or `(length, scale)` when present |
| `key` modifier | column is in the primary key (inline `PRIMARY KEY` or a table-level PK constraint, unified) |
| `optional` modifier | column is explicitly nullable and not part of the PK |
| Relationship per FK | `{Parent} [1] -> {Child} [card]`, default kind `->` (`RELA_DEFAULT`) |
| Unresolved FK | an FK whose referenced table is not in the input is **silently dropped** (no relationship) |
| Name de-duplication | a clashing relationship name gets a `Rel` suffix |

---

### 1. Junction table → many-to-many relationship

**Detects:** a pure bridge table — exactly **two** FKs, a composite PK, and *every* column is part of one
of those FKs (no payload columns), with both referenced tables present in the schema.

**Produces:** **no entity** for the junction table; instead one relationship between the two referenced
entities with `[0..N]` on both sides.

```sql
CREATE TABLE OrderItem (
    order_id   INT NOT NULL,
    product_id INT NOT NULL,
    PRIMARY KEY (order_id, product_id),
    FOREIGN KEY (order_id)   REFERENCES `Order`(id),
    FOREIGN KEY (product_id) REFERENCES Product(id)
);
```
→ `relationship OrderProduct { Order [0..N] -> Product [0..N] }` — no `OrderItem` entity.

**Cannot do / caveats:**
- A junction carrying **extra (payload) columns** — e.g. `quantity`, `added_at` — is an *association
  class*, not a pure bridge. It fails the "every column is an FK column" check and is kept as a **normal
  entity** with two ordinary relationships. Its attributes would otherwise be lost.
- Only the exact **2-FK** shape is recognised. Ternary+ junctions (3 FKs) remain entities.
- The M2M cardinality is fixed at `[0..N]`–`[0..N]`; UNIQUE/nullable constraints on the bridge are **not**
  reflected in it.

---

### 2. Inheritance / ISA detection (PK = FK)

**Detects:** a table whose **entire primary key equals one FK's source columns** (the subtype pattern —
the child's identity *is* the parent's). Self-references are excluded.

**Produces:** an `extends Parent` clause on the child entity; the identifying FK produces **no** relationship.

```sql
CREATE TABLE Employee (id INT PRIMARY KEY, name VARCHAR(100));
CREATE TABLE Manager  (id INT PRIMARY KEY, FOREIGN KEY (id) REFERENCES Employee(id));
```
→ `entity Manager extends Employee { id: INT key }` and **no** `EmployeeManager` relationship.

**Cannot do / caveats:**
- **Single inheritance only.** If two FKs each equal the PK, only the first becomes `extends`; the rest
  fall through to normal relationships.
- Detection is by **column set equality of source columns vs. PK**; it does *not* verify that
  `fk.referencedColumns` are the parent's PK. A child whose PK references a non-PK parent column is still
  treated as ISA.
- The shared PK column is kept as a `key` attribute on the child (the DSL has no "inherited key" concept).

---

### 3. Weak entity (FK is part of, but not all of, the PK)

**Detects:** an FK whose source columns are a **proper subset** of the PK, where the remaining PK columns
contain at least one **genuine discriminator** (a PK column that is not itself any FK column).

**Produces:** the entity is marked `weak`; the owning FK becomes a `weak relationship`; the discriminator
column(s) get the `partial_key` modifier (the borrowed FK columns stay `key`).

```sql
CREATE TABLE Room (
    building_id INT NOT NULL,
    room_no     INT NOT NULL,
    capacity    INT,
    PRIMARY KEY (building_id, room_no),
    FOREIGN KEY (building_id) REFERENCES Building(id)
);
```
→ `weak entity Room { building_id: INT key; room_no: INT partial_key; capacity: INT optional }` plus
`weak relationship BuildingRoom { Building [1] -> Room [...] }`.

**Cannot do / caveats:**
- The **discriminator requirement** is what separates a weak entity from a payload-free association class.
  A table whose PK is composed *entirely* of FK columns is **not** treated as weak (it is a junction, or an
  association-class entity) — otherwise an FK column would be mislabeled as a partial key.
- The owning FK must be a *proper* subset of the PK. A full-PK FK is ISA (heuristic 2), not weak.
- Only **one** owner is inferred (the first qualifying FK). Doubly-weak entities are not modelled.

---

### 4. Cardinality inference (nullable + UNIQUE)

Replaces the previous stub that always emitted `[0..N]`. Applied to every ordinary FK; the referenced
(left/parent) side is always `1`. The FK-bearing (right/child) side is:

| FK columns | Not a UNIQUE FK (one-to-many) | UNIQUE FK (one-to-one) |
|---|---|---|
| all NOT NULL | `1..N` | `1` |
| any nullable | `0..N` | `0..1` |

- **Nullable** is checked per source column against `ownerTable.columns`.
- **UNIQUE** means a single source column flagged `isUnique`, or source columns matching a
  `uniqueConstraint`'s column list exactly.

**Cannot do / caveats:**
- This is a **structural approximation**, not a true min/max participation analysis. The `1..N` / `0..N`
  distinction encodes child-side mandatoriness from NOT NULL only; it does not (and cannot from DDL)
  guarantee a parent actually has children.
- The parent side is always `1`; partial participation of the parent is not inferred.
- A UNIQUE constraint that only *partially* overlaps the FK columns is not treated as one-to-one.

---

### 5. Self-referencing relationship naming

**Detects:** a single-column FK pointing back at its own table.

**Produces:** a role-based name derived from the FK column (trailing `id`/`_id` stripped, PascalCased)
instead of the doubled default — e.g. `Employee.manager_id → Employee` becomes `EmployeeManager` rather
than `EmployeeEmployee`. Cardinality is still inferred by heuristic 4.

**Cannot do / caveats:**
- **Composite** self-referencing FKs fall back to the default `{Entity}{Entity}` name.
- If the column name strips to nothing useful (e.g. literally `id`), the default name is used.
- It only renames; it does not add an explicit relationship `role` label or a recursive flag.

---

### Precedence

A table matches **at most one** structural classification, evaluated in this order (first match wins):

1. **Junction** (→ M2M relationship, no entity)
2. **ISA** (→ `extends`, identifying FK suppressed)
3. **Weak entity** (→ `weak` entity + `weak relationship` + `partial_key`)
4. **Plain entity** (→ ordinary relationships with cardinality inference + self-ref naming)

This ordering matters because the shapes overlap: a junction's FKs are each a subset of its PK (which would
otherwise look weak), and a weak entity's owner FK is a subset of the PK (which a payload-free table could
confuse with a junction). Classifying once, in this order, makes the outcome deterministic.

### Global limitations (what the heuristics *cannot* do)

- **DDL only — no data sampling.** Every inference comes from the `CREATE TABLE` text. Actual row distributions, real cardinalities, and orphan rates are never consulted.
- **No semantic understanding.** Naming heuristics are lexical (suffix stripping, PascalCase). They do not
  understand domain meaning; `created_by` and `manager_id` are treated structurally alike.
- **Cross-schema / external references** to tables not present in the parsed input are dropped, not stubbed.
- **Parser limits propagate.** Anything the Phase-1 parser cannot extract for a given dialect (e.g. FKs in
  T-SQL/BigQuery, see the dialect notes above) is simply absent here — the analyzer cannot infer what it
  never received.
- **One classification per table.** Genuinely hybrid tables (e.g. a weak *and* junction-like table) are
  forced into a single bucket by the precedence rules above.
- These are **heuristics, not guarantees.** They aim for a sensible default ER model that a human can refine,
  not a provably correct schema reconstruction.
