# SQL Import — Dialect Demo

Nine SQL files, **each written idiomatically in its own dialect**, that all
import to the **byte-for-byte identical** ER model. This shows that the
dialect-specific AST quirks are normalized away by the `SchemaModel` layer.

Files live in [`dialects/`](dialects/).

## The shared target model

Every file below imports to exactly this:

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

## What's idiomatic in each file

| File | Dialect | Native flavor it shows off |
|---|---|---|
| [`mysql.sql`](dialects/mysql.sql) | MySQL | `` `backtick` `` identifiers, `AUTO_INCREMENT`, `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, named FK constraint |
| [`mariadb.sql`](dialects/mariadb.sql) | MariaDB | backticks + inline `AUTO_INCREMENT PRIMARY KEY` |
| [`postgresql.sql`](dialects/postgresql.sql) | PostgreSQL | `"double-quoted"` identifiers, named table-level FK constraint |
| [`sqlite.sql`](dialects/sqlite.sql) | SQLite | `CREATE TABLE IF NOT EXISTS` |
| [`hive.sql`](dialects/hive.sql) | Apache Hive | plain ANSI constraints |
| [`db2.sql`](dialects/db2.sql) | IBM DB2 | `schema.table` qualified names (the `app.` schema is normalized away) |
| [`redshift.sql`](dialects/redshift.sql) | Amazon Redshift | standard logical DDL |
| [`snowflake.sql`](dialects/snowflake.sql) | Snowflake | standard logical DDL |
| [`flinksql.sql`](dialects/flinksql.sql) | Apache Flink SQL | single-line statements (the parser rejects newlines inside a statement) |

## How to run the demo

1. Open a `dialects/*.sql` file.
2. Run **ER: Import** and pick the matching dialect.
3. A new `.er` file is generated next to it — same diagram every time.

## Why these 9 (and not all 11)

The demo uses `INT` + `VARCHAR` (accepted by all 9 above) so the output is
literally identical. The remaining two dialects can't join this particular
demo, and that's the documented limitation:

- **T-SQL / SQL Server** — `FOREIGN KEY` clauses cause a parse error in the
  underlying `node-sql-parser`, so the relationship can't be produced.
- **BigQuery** — same FK parse error, *and* it rejects `INT`/`VARCHAR`
  (it wants `INT64`/`STRING`), so even the entities wouldn't match byte-for-byte.

Both are flagged in the dialect picker (`T-SQL / SQL Server (no FK)`,
`BigQuery (no FK)`) and in [`../docs/sql-import.md`](../docs/sql-import.md).

### Notes on idioms the parser rejects

A few iconic clauses are **not** supported by `node-sql-parser` and were left
out so the files import cleanly: PostgreSQL/DB2 `GENERATED ALWAYS AS IDENTITY`,
Redshift `IDENTITY(1,1)` and `DISTKEY`/`SORTKEY`, Snowflake `AUTOINCREMENT` and
`CLUSTER BY`, Hive `DISABLE NOVALIDATE`. Physical-tuning clauses like these
aren't part of the logical ER model anyway.
