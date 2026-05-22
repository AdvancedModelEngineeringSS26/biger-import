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

1. Open (or create) a `.er` file in VS Code.
2. Run the command **ER: Import** from the command palette, the editor context menu, or the editor title bar icon.
3. Select the SQL dialect of the file you want to import.
4. Pick the `.sql` file using the file dialog.

The contents of the active `.er` file are replaced with the generated diagram. The operation is undoable via standard VS Code undo (`Cmd+Z` / `Ctrl+Z`).

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

Current heuristics:

- **Entity naming** — table names are converted to PascalCase identifiers (`order_item` → `OrderItem`). Non-word characters are replaced with underscores; names starting with a digit are prefixed with `_`.
- **Primary key unification** — inline `PRIMARY KEY` column modifiers and table-level `CONSTRAINT PRIMARY KEY` declarations are merged into a single set, correctly handling composite PKs.
- **Attribute modifier** — a column in the PK set gets the `key` modifier; a column with an explicit `NULL` keyword gets `optional`; all other columns (NOT NULL or unspecified) get no modifier.
- **Relationship cardinality** — every FK produces a `[1] → [0..N]` relationship: `[1]` on the referenced table side, `[0..N]` on the FK-bearing table side. The `resolveCardinality` function is isolated so this heuristic is easy to refine.
- **Relationship naming** — the base name is `{ReferencedEntity}{OwnerEntity}`; if that name is already taken, `Rel` is appended.
- **Unresolved FK filtering** — if a FK references a table not present in the input file, the relationship is silently omitted.

### Phase 3 — ER Serializer (`er-serializer.ts`)

**Input:** `ErModel`  
**Output:** `.er` text

Converts the `ErModel` into the bigER textual syntax. Pure string transformation with no logic. The output always starts with:

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

The extension reads the `.sql` file content itself and sends it as a plain string — no file I/O happens inside the language server.

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
   │                        referencedColumns[], onDelete?, onUpdate?
   ├─ SchemaUniqueConstraint[]   constraintName?, columns[]
   └─ SchemaCheckConstraint[]    constraintName?
```

### `ErModel` — ER layer

```
ErModel
├─ ErEntity[]          name (PascalCase), ErAttribute[]
│                          name, dataType?, modifier?
└─ ErRelationship[]    name, leftEntity, leftCardinality,
                       rightEntity, rightCardinality, kind
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
| `src/import/import-command.ts` | `extension` | VS Code command, dialect picker, file dialog |
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
| `test/import/schema-analyzer.test.ts` | Phase 2 | Entity name derivation (snake_case → PascalCase), attribute modifiers (key / optional / none), data type formatting, relationship creation (left/right entity, kind, cardinality), FK to unknown table filtered out, two FKs from one table, empty schema |
| `test/import/er-serializer.test.ts` | Phase 3 | Header, entity blocks with all modifier variants, attribute without data type, relationship body with cardinality and arrow symbol, entity-before-relationship ordering, multiple entities/relationships, empty model |

Each test file is fully independent — Phase 2 and Phase 3 tests construct their input data directly without calling earlier phases.

---

## Possible Heuristics to Implement

The `SchemaModel` already captures all the information needed for the following improvements. All changes belong in `schema-analyzer.ts`.

### Junction table → many-to-many relationship

**Condition:** a table whose columns consist entirely of FK columns, and whose PK is a composite of those FK columns (a classic bridge/junction table).

**Current behaviour:** the junction table becomes an entity with `key` attributes.

**Proposed behaviour:** skip generating an entity for the junction table; instead generate a single relationship between the two referenced entities with `[0..N]` cardinality on both sides.

**Example:**
```sql
CREATE TABLE OrderItem (
    order_id   INT NOT NULL,
    product_id INT NOT NULL,
    PRIMARY KEY (order_id, product_id),
    FOREIGN KEY (order_id)   REFERENCES `Order`(id),
    FOREIGN KEY (product_id) REFERENCES Product(id)
);
```
→ `relationship OrderProduct { Order [0..N] -> Product [0..N] }` instead of an `OrderItem` entity.

---

### One-to-one via UNIQUE constraint on FK

**Condition:** the FK source columns are also covered by a UNIQUE constraint on the same table.

**Current behaviour:** cardinality is always `[0..N]` on the FK-bearing side.

**Proposed behaviour:** change to `[0..1]` (nullable FK) or `[1]` (NOT NULL FK) to express a one-to-one association.

**Detection:** check whether `fk.sourceColumns` matches the `columns` list of any entry in `table.uniqueConstraints`.

---

### Nullable FK → optional participation cardinality

**Condition:** at least one FK source column is nullable (no NOT NULL constraint).

**Current behaviour:** cardinality is always `[0..N]` regardless of nullability.

**Proposed behaviour:**
- All FK source columns NOT NULL → `[1..N]` (mandatory participation — every referenced row has at least one child)
- Any FK source column nullable → `[0..N]` (optional participation)

**Detection:** look up each FK source column by name in `ownerTable.columns` and check `column.nullable`. The hook for this already exists in `resolveCardinality` in `schema-analyzer.ts`.

---

### Inheritance / ISA detection (PK = FK)

**Condition:** a table's entire primary key is also a foreign key to another table (the subtype pattern — the child table's PK references the parent's PK).

**Current behaviour:** generates a regular one-to-many relationship.

**Proposed behaviour:** generate an `extends` clause on the child entity instead of a relationship, representing ISA / specialisation in the ER model.

**Detection:** check whether `fk.sourceColumns` equals `table.primaryKey.columns` (same set, same table) and `fk.referencedColumns` equals the PK of the referenced table.

---

### Self-referencing relationship

**Condition:** a FK references the same table it is defined on (e.g. an `Employee` table with a `manager_id` FK back to `Employee`).

**Current behaviour:** produces a relationship where both sides name the same entity, which is valid ER but may have a confusing auto-generated name (`EmployeeEmployee`).

**Proposed behaviour:** generate a more descriptive relationship name using the FK source column name as a hint (e.g. `EmployeeManager`), and optionally flag it as a recursive relationship.

**Detection:** `fk.referencedTable.toLowerCase() === ownerTable.name.toLowerCase()`.
