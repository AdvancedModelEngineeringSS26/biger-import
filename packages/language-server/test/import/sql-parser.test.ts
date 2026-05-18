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
