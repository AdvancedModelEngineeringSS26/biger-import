# SQL Parser Comparison

This document compares the available TypeScript/Node.js SQL parsing libraries and justifies the choice of `node-sql-parser` for the bigER SQL import feature.

## The Problem

The bigER SQL import pipeline (`SqlImportService.importFromSql`) needs to parse SQL DDL (Data Definition Language) files containing `CREATE TABLE` statements and extract:

- Table names → Entity names
- Column definitions → Attributes (name, data type, key/optional modifiers)
- `PRIMARY KEY` constraints → `key` attribute type
- `FOREIGN KEY` constraints → Relationship definitions

The parser must work inside the bigER language server, which is bundled by esbuild into a single CJS file (`bundle: true`, `format: 'cjs'`). This rules out parsers that rely on native binaries or WASM blobs unless explicitly handled.

---

## Candidates Evaluated

### 1. `node-sql-parser`

**Repository:** https://github.com/taozhi8833998/node-sql-parser  
**License:** Apache-2.0  
**Weekly downloads:** ~700K

Supports MySQL, PostgreSQL, SQLite, T-SQL (TransactSQL), BigQuery, Hive, MariaDB, DB2, Redshift, FlinkSQL, Snowflake, and more. Returns a typed AST for all SQL statement types including full DDL (`CREATE TABLE`, `ALTER TABLE`, etc.) with inline and table-level constraint nodes.

**Pros:**
- Multi-dialect: handles the most common SQL variants users may paste
- Pure JavaScript — zero native bindings or WASM
- Bundled TypeScript types
- Full DDL coverage: inline PK, table-level PK, FK with `reference_definition`, composite keys
- Actively maintained
- Trivially inlined by esbuild with no special loader configuration

**Cons:**
- AST structure is slightly inconsistent across dialects (column name access path differs between MySQL and PG mode)
- Not 100% spec-compliant for every edge case in every dialect

---

### 2. `pgsql-parser`

**Repository:** https://github.com/launchql/pgsql-parser  
**License:** MIT  
**Weekly downloads:** ~77K

Uses the actual PostgreSQL C library (`libpg_query`) compiled to WASM. Returns PostgreSQL's own internal parse tree.

**Pros:**
- 100% spec-compliant for PostgreSQL syntax
- Handles all PG-specific DDL constructs
- Actively maintained (releases in 2026)

**Cons:**
- **PostgreSQL only** — users with MySQL/SQLite schemas are excluded
- Ships a WASM binary; esbuild requires a custom `loader: { '.wasm': 'file' }` configuration and the binary must be co-located at runtime — complicating the extension bundle
- Complex and deeply nested AST (mirrors internal PG structures) increases implementation effort
- Overkill for a DDL-only use case

---

### 3. `sql-ddl-to-json-schema`

**Repository:** https://github.com/duartealexf/sql-ddl-to-json-schema  
**License:** MIT  
**Weekly downloads:** ~10K

Parses MySQL and MariaDB DDL and converts it directly to JSON Schema format. Actively maintained — v6.0.0 released August 2025. Written in TypeScript with bundled type definitions.

**Pros:**
- Specifically designed for DDL (no irrelevant DML baggage)
- Convenient JSON Schema output
- Bundled TypeScript types
- Actively maintained

**Cons:**
- **MySQL and MariaDB only** — no PostgreSQL, SQLite, or other dialects
- JSON Schema output format requires an extra translation step to produce `.er` text
- Cannot be used as a general-purpose SQL importer

---

### 4. `sql-parser-cst`

**Repository:** https://github.com/nene/sql-parser-cst  
**License:** GPL-2.0-or-later  
**Weekly downloads:** ~36K

A TypeScript-first Concrete Syntax Tree (CST) parser. Preserves the exact syntactic structure of the original SQL, including whitespace and comments.

**Pros:**
- Clean TypeScript-first API
- CST preserves original structure (useful for round-tripping, less relevant for import)
- Full support for SQLite and BigQuery

**Cons:**
- **GPL-2.0-or-later license** — copyleft license incompatible with the project's MIT license; using it would require the language server to be released under GPL
- MySQL, MariaDB, and PostgreSQL support are all experimental, not production-ready
- CST verbosity makes DDL extraction more verbose than a plain AST

---

## Comparison Table

| Criterion | **node-sql-parser** | pgsql-parser | sql-ddl-to-json-schema | sql-parser-cst |
|---|---|---|---|---|
| Dialects | MySQL, PG, SQLite, T-SQL, BigQuery, Hive, MariaDB, DB2, Redshift, and more | PostgreSQL only | MySQL and MariaDB only | SQLite, BigQuery (full); MySQL, MariaDB, PG (experimental) |
| TypeScript types | Yes (bundled) | Minimal | Yes (bundled) | Yes |
| DDL coverage | Full (PK/FK, inline + table-level) | Full (PG only) | Full (MySQL only) | Partial |
| ESM/Node compat | Pure JS | WASM binary | Pure JS | Pure JS |
| esbuild bundling | Trivial — inlined automatically | Requires WASM loader + runtime copy | Trivial | Trivial |
| Maintenance | Active | Active | Active | Active |
| Weekly downloads | ~700K | ~77K | ~10K | ~36K |
| License | Apache-2.0 | MIT | MIT | **GPL-2.0** |

---

## Decision: `node-sql-parser`

`node-sql-parser` is the only candidate that satisfies all hard constraints simultaneously:

1. **Multi-dialect** — bigER users may import SQL from MySQL, PostgreSQL, SQLite, or other sources. Restricting to one dialect (as both `pgsql-parser` and `sql-ddl-to-json-schema` do) would reject a significant portion of real-world SQL files.

2. **Pure JavaScript** — the esbuild pipeline (`bundle: true`, `format: 'cjs'`, no custom loaders) can inline `node-sql-parser` without any configuration changes. A WASM-based parser (`pgsql-parser`) would require adding a WASM file loader, copying the binary to the `pack/` output directory, and adjusting runtime paths — a disproportionate cost.

3. **Compatible license** — Apache-2.0 is permissive and compatible with this MIT-licensed project. `sql-parser-cst`'s GPL-2.0 license would require the language server to be re-licensed under GPL, which is not acceptable.

4. **Full DDL AST** — inline PKs, table-level PK/FK constraints, composite keys, column data types with precision/scale, and nullable modifiers are all present and accessible in the AST.

5. **Highest adoption** — ~700K weekly downloads and active maintenance reduce the risk of unresolved bugs or abandoned support.

The version pinned in `packages/language-server/package.json` is `^5.4.0` (the version resolved at install time).
