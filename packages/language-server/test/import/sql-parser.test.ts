import { describe, it, expect } from 'vitest';
import { parseSql } from '../../src/import/sql-parser.js';

// ── Table-level parsing ────────────────────────────────────────────────────

describe('parseSql – table-level parsing', () => {
    it('parses a single table name', () => {
        const result = parseSql('CREATE TABLE users (id INT);', 'MySQL');
        expect(result.tables).toHaveLength(1);
        expect(result.tables[0].name).toBe('users');
    });

    it('returns empty tables for SQL with no CREATE TABLE', () => {
        const result = parseSql('SELECT 1;', 'MySQL');
        expect(result.tables).toHaveLength(0);
    });

    it('parses multiple CREATE TABLE statements', () => {
        const sql = `
            CREATE TABLE a (id INT);
            CREATE TABLE b (id INT);
            CREATE TABLE c (id INT);
        `;
        const result = parseSql(sql, 'MySQL');
        expect(result.tables).toHaveLength(3);
        expect(result.tables.map(t => t.name)).toEqual(['a', 'b', 'c']);
    });

    it('sets dialect on the returned model', () => {
        expect(parseSql('CREATE TABLE t (id INT);', 'MySQL').dialect).toBe('MySQL');
        expect(parseSql('CREATE TABLE t (id INT);', 'PostgreSQL').dialect).toBe('PostgreSQL');
    });
});

// ── Column data types ──────────────────────────────────────────────────────

describe('parseSql – column data types', () => {
    it('extracts a simple data type', () => {
        const [table] = parseSql('CREATE TABLE t (x INT);', 'MySQL').tables;
        expect(table.columns[0].dataType).toEqual({ typeName: 'INT' });
    });

    it('extracts a data type with length', () => {
        const [table] = parseSql('CREATE TABLE t (x VARCHAR(255));', 'MySQL').tables;
        expect(table.columns[0].dataType).toEqual({ typeName: 'VARCHAR', length: 255 });
    });

    it('extracts a data type with length and scale', () => {
        const [table] = parseSql('CREATE TABLE t (x DECIMAL(10, 2));', 'MySQL').tables;
        expect(table.columns[0].dataType).toEqual({ typeName: 'DECIMAL', length: 10, scale: 2 });
    });
});

// ── Column nullability ─────────────────────────────────────────────────────

describe('parseSql – column nullability', () => {
    it('marks nullable=false when NOT NULL is declared', () => {
        const [table] = parseSql('CREATE TABLE t (x INT NOT NULL);', 'MySQL').tables;
        expect(table.columns[0].nullable).toBe(false);
    });

    it('marks nullable=true when NULL is explicitly declared', () => {
        const [table] = parseSql('CREATE TABLE t (x INT NULL);', 'MySQL').tables;
        expect(table.columns[0].nullable).toBe(true);
    });

    it('marks nullable=false when no null declaration is given', () => {
        const [table] = parseSql('CREATE TABLE t (x INT);', 'MySQL').tables;
        expect(table.columns[0].nullable).toBe(false);
    });
});

// ── Column flags ───────────────────────────────────────────────────────────

describe('parseSql – column flags', () => {
    it('marks isPrimaryKey=true for inline PRIMARY KEY', () => {
        const [table] = parseSql('CREATE TABLE t (id INT PRIMARY KEY);', 'MySQL').tables;
        expect(table.columns[0].isPrimaryKey).toBe(true);
    });

    it('marks isUnique=true for inline UNIQUE', () => {
        const [table] = parseSql('CREATE TABLE t (email VARCHAR(100) UNIQUE);', 'MySQL').tables;
        expect(table.columns[0].isUnique).toBe(true);
    });

    it('marks autoIncrement=true for AUTO_INCREMENT', () => {
        const [table] = parseSql('CREATE TABLE t (id INT AUTO_INCREMENT);', 'MySQL').tables;
        expect(table.columns[0].autoIncrement).toBe(true);
    });

    it('extracts DEFAULT value', () => {
        const [table] = parseSql('CREATE TABLE t (qty INT DEFAULT 0);', 'MySQL').tables;
        expect(table.columns[0].defaultValue).toBe('0');
    });
});

// ── Table-level PRIMARY KEY constraint ────────────────────────────────────

describe('parseSql – PRIMARY KEY constraint', () => {
    it('extracts table-level PRIMARY KEY columns', () => {
        const sql = 'CREATE TABLE t (id INT NOT NULL, PRIMARY KEY (id));';
        const [table] = parseSql(sql, 'MySQL').tables;
        expect(table.primaryKey?.columns).toEqual(['id']);
    });

    it('extracts composite PRIMARY KEY columns', () => {
        const sql = 'CREATE TABLE t (a INT, b INT, PRIMARY KEY (a, b));';
        const [table] = parseSql(sql, 'MySQL').tables;
        expect(table.primaryKey?.columns).toEqual(['a', 'b']);
    });

    it('extracts named PRIMARY KEY constraint name', () => {
        const sql = 'CREATE TABLE t (id INT, CONSTRAINT pk_t PRIMARY KEY (id));';
        const [table] = parseSql(sql, 'MySQL').tables;
        expect(table.primaryKey?.constraintName).toBe('pk_t');
    });
});

// ── FOREIGN KEY constraint ─────────────────────────────────────────────────

describe('parseSql – FOREIGN KEY constraint', () => {
    it('extracts sourceColumns, referencedTable, and referencedColumns', () => {
        const sql = `
            CREATE TABLE orders (
                id INT,
                customer_id INT,
                FOREIGN KEY (customer_id) REFERENCES customers(id)
            );
        `;
        const [table] = parseSql(sql, 'MySQL').tables;
        expect(table.foreignKeys).toHaveLength(1);
        const fk = table.foreignKeys[0];
        expect(fk.sourceColumns).toEqual(['customer_id']);
        expect(fk.referencedTable).toBe('customers');
        expect(fk.referencedColumns).toEqual(['id']);
    });

    it('extracts a named FOREIGN KEY constraint name', () => {
        const sql = `
            CREATE TABLE orders (
                customer_id INT,
                CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
            );
        `;
        const [table] = parseSql(sql, 'MySQL').tables;
        expect(table.foreignKeys[0].constraintName).toBe('fk_order_customer');
    });

    it('extracts ON DELETE CASCADE', () => {
        const sql = `
            CREATE TABLE orders (
                customer_id INT,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
            );
        `;
        const [table] = parseSql(sql, 'MySQL').tables;
        expect(table.foreignKeys[0].onDelete).toBe('CASCADE');
    });

    it('extracts ON UPDATE SET NULL', () => {
        const sql = `
            CREATE TABLE orders (
                customer_id INT,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE SET NULL
            );
        `;
        const [table] = parseSql(sql, 'MySQL').tables;
        expect(table.foreignKeys[0].onUpdate).toBe('SET NULL');
    });

    it('extracts multiple FOREIGN KEYs from one table', () => {
        const sql = `
            CREATE TABLE order_item (
                order_id INT,
                product_id INT,
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            );
        `;
        const [table] = parseSql(sql, 'MySQL').tables;
        expect(table.foreignKeys).toHaveLength(2);
    });
});

// ── UNIQUE and CHECK constraints ───────────────────────────────────────────

describe('parseSql – UNIQUE constraint', () => {
    it('extracts a table-level UNIQUE constraint', () => {
        const sql = 'CREATE TABLE t (email VARCHAR(100), UNIQUE (email));';
        const [table] = parseSql(sql, 'MySQL').tables;
        expect(table.uniqueConstraints).toHaveLength(1);
        expect(table.uniqueConstraints[0].columns).toEqual(['email']);
    });
});

describe('parseSql – CHECK constraint', () => {
    it('extracts a CHECK constraint', () => {
        const sql = 'CREATE TABLE t (age INT, CONSTRAINT chk_age CHECK (age >= 0));';
        const [table] = parseSql(sql, 'MySQL').tables;
        expect(table.checkConstraints).toHaveLength(1);
    });
});

// ── Dialects ───────────────────────────────────────────────────────────────

describe('parseSql – dialects', () => {
    it('parses a basic table with MySQL dialect', () => {
        const result = parseSql('CREATE TABLE t (id INT PRIMARY KEY);', 'MySQL');
        expect(result.tables).toHaveLength(1);
    });

    it('parses a basic table with PostgreSQL dialect', () => {
        const result = parseSql('CREATE TABLE t (id INT PRIMARY KEY);', 'PostgreSQL');
        expect(result.tables).toHaveLength(1);
    });
});

// ── MariaDB ────────────────────────────────────────────────────────────────

describe('parseSql – MariaDB', () => {
    it('parses columns', () => {
        const sql = 'CREATE TABLE products (id INT NOT NULL, name VARCHAR(200), price DECIMAL(10, 2));';
        const [table] = parseSql(sql, 'MariaDB').tables;
        expect(table.name).toBe('products');
        expect(table.columns[0].name).toBe('id');
        expect(table.columns[1].dataType.typeName).toBe('VARCHAR');
    });

    it('parses a FOREIGN KEY', () => {
        const sql = `
            CREATE TABLE orders (
                id INT,
                customer_id INT,
                FOREIGN KEY (customer_id) REFERENCES customers(id)
            );
        `;
        const [table] = parseSql(sql, 'MariaDB').tables;
        expect(table.foreignKeys[0].referencedTable).toBe('customers');
    });
});

// ── SQLite ─────────────────────────────────────────────────────────────────

describe('parseSql – SQLite', () => {
    it('parses columns', () => {
        const sql = 'CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT NOT NULL, qty REAL);';
        const [table] = parseSql(sql, 'Sqlite').tables;
        expect(table.name).toBe('items');
        expect(table.columns[0].isPrimaryKey).toBe(true);
        expect(table.columns[1].dataType.typeName).toBe('TEXT');
    });

    it('parses a FOREIGN KEY', () => {
        const sql = `
            CREATE TABLE order_items (
                order_id INTEGER,
                product_id INTEGER,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            );
        `;
        const [table] = parseSql(sql, 'Sqlite').tables;
        expect(table.foreignKeys[0].sourceColumns).toEqual(['order_id']);
        expect(table.foreignKeys[0].referencedTable).toBe('orders');
    });
});

// ── Hive ───────────────────────────────────────────────────────────────────

describe('parseSql – Hive', () => {
    it('parses Hive-native column types', () => {
        const sql = `
            CREATE TABLE events (
                event_id BIGINT,
                score DOUBLE,
                label STRING,
                created_at TIMESTAMP
            );
        `;
        const [table] = parseSql(sql, 'Hive').tables;
        expect(table.name).toBe('events');
        expect(table.columns[0].dataType.typeName).toBe('BIGINT');
        expect(table.columns[1].dataType.typeName).toBe('DOUBLE');
        expect(table.columns[2].dataType.typeName).toBe('STRING');
        expect(table.columns[3].dataType.typeName).toBe('TIMESTAMP');
    });

    it('parses a FOREIGN KEY', () => {
        const sql = `
            CREATE TABLE facts (
                id BIGINT,
                dim_id BIGINT,
                FOREIGN KEY (dim_id) REFERENCES dimensions(id)
            );
        `;
        const [table] = parseSql(sql, 'Hive').tables;
        expect(table.foreignKeys[0].referencedTable).toBe('dimensions');
    });
});

// ── IBM DB2 ────────────────────────────────────────────────────────────────

describe('parseSql – DB2', () => {
    it('parses columns', () => {
        const sql = `
            CREATE TABLE employees (
                emp_id INT NOT NULL,
                name VARCHAR(100),
                salary DECIMAL(15, 2)
            );
        `;
        const [table] = parseSql(sql, 'DB2').tables;
        expect(table.name).toBe('employees');
        expect(table.columns[0].nullable).toBe(false);
        expect(table.columns[2].dataType).toEqual({ typeName: 'DECIMAL', length: 15, scale: 2 });
    });

    it('parses a FOREIGN KEY', () => {
        const sql = `
            CREATE TABLE emp_dept (
                emp_id INT,
                dept_id INT,
                FOREIGN KEY (dept_id) REFERENCES departments(id)
            );
        `;
        const [table] = parseSql(sql, 'DB2').tables;
        expect(table.foreignKeys[0].referencedTable).toBe('departments');
    });
});

// ── Snowflake ──────────────────────────────────────────────────────────────

describe('parseSql – Snowflake', () => {
    it('parses columns', () => {
        const sql = `
            CREATE TABLE accounts (
                account_id INT NOT NULL,
                name VARCHAR(200),
                balance FLOAT
            );
        `;
        const [table] = parseSql(sql, 'Snowflake').tables;
        expect(table.name).toBe('accounts');
        expect(table.columns[0].nullable).toBe(false);
        expect(table.columns[1].dataType.typeName).toBe('VARCHAR');
    });

    it('parses a FOREIGN KEY', () => {
        const sql = `
            CREATE TABLE transactions (
                txn_id INT,
                account_id INT,
                FOREIGN KEY (account_id) REFERENCES accounts(account_id)
            );
        `;
        const [table] = parseSql(sql, 'Snowflake').tables;
        expect(table.foreignKeys[0].referencedTable).toBe('accounts');
    });
});

// ── Apache Flink SQL ───────────────────────────────────────────────────────

describe('parseSql – FlinkSQL', () => {
    // node-sql-parser's FlinkSQL grammar does not support multi-line SQL; tests use single-line form.
    it('parses columns', () => {
        const [table] = parseSql('CREATE TABLE t (id BIGINT NOT NULL, val FLOAT, amount DECIMAL(10, 2));', 'FlinkSQL').tables;
        expect(table.name).toBe('t');
        expect(table.columns[0].dataType.typeName).toBe('BIGINT');
        expect(table.columns[1].dataType.typeName).toBe('FLOAT');
        expect(table.columns[2].dataType).toEqual({ typeName: 'DECIMAL', length: 10, scale: 2 });
    });

    it('parses a FOREIGN KEY', () => {
        const [table] = parseSql('CREATE TABLE readings (id INT, device_id INT, FOREIGN KEY (device_id) REFERENCES devices(id));', 'FlinkSQL').tables;
        expect(table.foreignKeys[0].sourceColumns).toEqual(['device_id']);
        expect(table.foreignKeys[0].referencedTable).toBe('devices');
    });
});

// ── Amazon Redshift ────────────────────────────────────────────────────────

describe('parseSql – Redshift', () => {
    it('extracts column names correctly (expr.value AST shape)', () => {
        const sql = `
            CREATE TABLE users (
                user_id INT NOT NULL,
                email VARCHAR(255),
                PRIMARY KEY (user_id)
            );
        `;
        const [table] = parseSql(sql, 'Redshift').tables;
        expect(table.name).toBe('users');
        expect(table.columns.map(c => c.name)).toEqual(['user_id', 'email']);
        expect(table.primaryKey?.columns).toEqual(['user_id']);
    });

    it('parses a FOREIGN KEY', () => {
        const sql = `
            CREATE TABLE orders (
                order_id INT,
                user_id INT,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );
        `;
        const [table] = parseSql(sql, 'Redshift').tables;
        expect(table.foreignKeys[0].sourceColumns).toEqual(['user_id']);
        expect(table.foreignKeys[0].referencedTable).toBe('users');
    });
});

// ── T-SQL / SQL Server ─────────────────────────────────────────────────────

describe('parseSql – TransactSQL', () => {
    it('parses tables and columns (no FK)', () => {
        const sql = `
            CREATE TABLE customers (
                customer_id INT NOT NULL,
                first_name NVARCHAR(100),
                last_name NVARCHAR(100)
            );
        `;
        const [table] = parseSql(sql, 'TransactSQL').tables;
        expect(table.name).toBe('customers');
        expect(table.columns[0].name).toBe('customer_id');
        expect(table.columns[1].dataType.typeName).toBe('NVARCHAR');
    });

    it('throws when SQL contains a FOREIGN KEY (library limitation)', () => {
        const sql = `
            CREATE TABLE orders (
                order_id INT,
                customer_id INT,
                FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
            );
        `;
        expect(() => parseSql(sql, 'TransactSQL')).toThrow();
    });
});

// ── BigQuery ───────────────────────────────────────────────────────────────

describe('parseSql – BigQuery', () => {
    it('parses tables and BigQuery-native column types (no FK)', () => {
        const sql = `
            CREATE TABLE analytics.sessions (
                session_id INT64,
                score FLOAT64,
                label STRING,
                created_at DATETIME
            );
        `;
        const [table] = parseSql(sql, 'BigQuery').tables;
        expect(table.name).toBe('sessions');
        expect(table.columns[0].dataType.typeName).toBe('INT64');
        expect(table.columns[1].dataType.typeName).toBe('FLOAT64');
        expect(table.columns[2].dataType.typeName).toBe('STRING');
        expect(table.columns[3].dataType.typeName).toBe('DATETIME');
    });

    it('throws when SQL contains a FOREIGN KEY (library limitation)', () => {
        const sql = `
            CREATE TABLE orders (
                order_id INT64,
                customer_id INT64,
                FOREIGN KEY (customer_id) REFERENCES customers(customer_id) NOT ENFORCED
            );
        `;
        expect(() => parseSql(sql, 'BigQuery')).toThrow();
    });
});
