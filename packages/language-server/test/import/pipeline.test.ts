import { describe, it, expect } from 'vitest';
import { parseSql } from '../../src/import/sql-parser.js';
import { analyzeSchema } from '../../src/import/schema-analyzer.js';
import { serializeErModel } from '../../src/import/er-serializer.js';
import { SqlImportService } from '../../src/import/sql-import-service.js';
import type { SchemaDialect } from '../../src/import/schema-model.js';
import type { SqlDialect } from '@biger/common';

// ── Helper ─────────────────────────────────────────────────────────────────

function runPipeline(sql: string, dialect: SchemaDialect = 'MySQL'): string {
    return serializeErModel(analyzeSchema(parseSql(sql, dialect)));
}

// ── Single entity ──────────────────────────────────────────────────────────

describe('pipeline – single entity', () => {
    it('output starts with the ER header', () => {
        const output = runPipeline('CREATE TABLE users (id INT);');
        expect(output).toMatch(/^erdiagram ImportedFromSql\nnotation = uml/);
    });

    it('produces an entity block for the table', () => {
        const output = runPipeline('CREATE TABLE users (id INT);');
        expect(output).toContain('entity Users {');
        expect(output).toContain('}');
    });

    it('includes the column as an attribute', () => {
        const output = runPipeline('CREATE TABLE users (id INT);');
        expect(output).toContain('    id: INT');
    });
});

// ── Entity name derivation ─────────────────────────────────────────────────

describe('pipeline – entity name derivation', () => {
    it('converts snake_case table name to PascalCase entity', () => {
        const output = runPipeline('CREATE TABLE order_items (id INT);');
        expect(output).toContain('entity OrderItems {');
    });

    it('lowercases become PascalCase', () => {
        const output = runPipeline('CREATE TABLE customers (id INT);');
        expect(output).toContain('entity Customers {');
    });
});

// ── Column modifiers ───────────────────────────────────────────────────────

describe('pipeline – column modifiers', () => {
    it('marks inline PRIMARY KEY column with key modifier', () => {
        const output = runPipeline('CREATE TABLE t (id INT PRIMARY KEY);');
        expect(output).toContain('    id: INT key');
    });

    it('marks table-level PRIMARY KEY column with key modifier', () => {
        const output = runPipeline('CREATE TABLE t (id INT NOT NULL, PRIMARY KEY (id));');
        expect(output).toContain('    id: INT key');
    });

    it('marks composite PK columns with key modifier', () => {
        const output = runPipeline('CREATE TABLE t (a INT, b INT, PRIMARY KEY (a, b));');
        expect(output).toContain('    a: INT key');
        expect(output).toContain('    b: INT key');
    });

    it('marks nullable column with optional modifier', () => {
        const output = runPipeline('CREATE TABLE t (id INT, email VARCHAR(100) NULL);');
        expect(output).toContain('    email: VARCHAR(100) optional');
    });

    it('marks NOT NULL column with no modifier', () => {
        const output = runPipeline('CREATE TABLE t (name VARCHAR(50) NOT NULL);');
        expect(output).toContain('    name: VARCHAR(50)');
        expect(output).not.toContain('optional');
        expect(output).not.toContain('key');
    });
});

// ── Data types ─────────────────────────────────────────────────────────────

describe('pipeline – data types', () => {
    it('preserves VARCHAR with length', () => {
        const output = runPipeline('CREATE TABLE t (name VARCHAR(255));');
        expect(output).toContain('    name: VARCHAR(255)');
    });

    it('preserves DECIMAL with length and scale', () => {
        const output = runPipeline('CREATE TABLE t (price DECIMAL(10, 2));');
        expect(output).toContain('    price: DECIMAL(10, 2)');
    });

    it('preserves simple INT type', () => {
        const output = runPipeline('CREATE TABLE t (qty INT);');
        expect(output).toContain('    qty: INT');
    });
});

// ── Relationships ──────────────────────────────────────────────────────────

describe('pipeline – relationships', () => {
    it('produces a relationship block when a FOREIGN KEY is present', () => {
        const sql = `
            CREATE TABLE customers (id INT PRIMARY KEY);
            CREATE TABLE orders (id INT, customer_id INT, FOREIGN KEY (customer_id) REFERENCES customers(id));
        `;
        const output = runPipeline(sql);
        expect(output).toContain('relationship');
    });

    it('sets left side to the referenced entity with cardinality [1]', () => {
        const sql = `
            CREATE TABLE customers (id INT PRIMARY KEY);
            CREATE TABLE orders (id INT, customer_id INT, FOREIGN KEY (customer_id) REFERENCES customers(id));
        `;
        const output = runPipeline(sql);
        expect(output).toContain('Customers [1]');
    });

    it('sets right side to the owning entity with cardinality [0..N]', () => {
        const sql = `
            CREATE TABLE customers (id INT PRIMARY KEY);
            CREATE TABLE orders (id INT, customer_id INT, FOREIGN KEY (customer_id) REFERENCES customers(id));
        `;
        const output = runPipeline(sql);
        expect(output).toContain('Orders [0..N]');
    });

    it('names the relationship after the two entity names', () => {
        const sql = `
            CREATE TABLE customers (id INT PRIMARY KEY);
            CREATE TABLE orders (id INT, customer_id INT, FOREIGN KEY (customer_id) REFERENCES customers(id));
        `;
        const output = runPipeline(sql);
        expect(output).toContain('relationship CustomersOrders {');
    });

    it('omits a relationship when the referenced table is absent', () => {
        const sql = `
            CREATE TABLE orders (id INT, customer_id INT, FOREIGN KEY (customer_id) REFERENCES customers(id));
        `;
        const output = runPipeline(sql);
        expect(output).not.toContain('relationship');
    });

    it('produces two relationships for two FKs from one table', () => {
        const sql = `
            CREATE TABLE customers (id INT PRIMARY KEY);
            CREATE TABLE products (id INT PRIMARY KEY);
            CREATE TABLE orders (
                id INT,
                customer_id INT,
                product_id INT,
                FOREIGN KEY (customer_id) REFERENCES customers(id),
                FOREIGN KEY (product_id) REFERENCES products(id)
            );
        `;
        const output = runPipeline(sql);
        const relCount = (output.match(/^relationship /mg) ?? []).length;
        expect(relCount).toBe(2);
    });
});

// ── Realistic schema ───────────────────────────────────────────────────────

describe('pipeline – realistic blog schema', () => {
    const SQL = `
        CREATE TABLE users (
            id INT NOT NULL AUTO_INCREMENT,
            username VARCHAR(50) NOT NULL,
            email VARCHAR(100) NULL,
            PRIMARY KEY (id)
        );

        CREATE TABLE posts (
            id INT NOT NULL AUTO_INCREMENT,
            title VARCHAR(255) NOT NULL,
            author_id INT NOT NULL,
            PRIMARY KEY (id),
            FOREIGN KEY (author_id) REFERENCES users(id)
        );

        CREATE TABLE comments (
            id INT NOT NULL AUTO_INCREMENT,
            body TEXT NOT NULL,
            post_id INT NOT NULL,
            author_id INT NOT NULL,
            PRIMARY KEY (id),
            FOREIGN KEY (post_id) REFERENCES posts(id),
            FOREIGN KEY (author_id) REFERENCES users(id)
        );
    `;

    it('produces three entity blocks', () => {
        const output = runPipeline(SQL);
        expect(output).toContain('entity Users {');
        expect(output).toContain('entity Posts {');
        expect(output).toContain('entity Comments {');
    });

    it('marks PK columns with key modifier in all entities', () => {
        const output = runPipeline(SQL);
        expect(output).toMatch(/entity Users \{[^}]*id: INT key/s);
        expect(output).toMatch(/entity Posts \{[^}]*id: INT key/s);
        expect(output).toMatch(/entity Comments \{[^}]*id: INT key/s);
    });

    it('marks nullable email column as optional', () => {
        const output = runPipeline(SQL);
        expect(output).toContain('    email: VARCHAR(100) optional');
    });

    it('produces three relationship blocks', () => {
        const output = runPipeline(SQL);
        const relCount = (output.match(/^relationship /mg) ?? []).length;
        expect(relCount).toBe(3);
    });

    it('places all entity blocks before relationship blocks', () => {
        const output = runPipeline(SQL);
        const lastEntityPos = Math.max(
            output.indexOf('entity Users'),
            output.indexOf('entity Posts'),
            output.indexOf('entity Comments'),
        );
        const firstRelPos = output.indexOf('relationship');
        expect(lastEntityPos).toBeLessThan(firstRelPos);
    });
});

// ── SqlImportService ───────────────────────────────────────────────────────

function makeParams(sqlContent: string, dialect: SqlDialect = 'MySQL') {
    return {
        erDocumentUri: 'file:///test.er',
        sqlDocumentUri: 'file:///test.sql',
        sqlContent,
        dialect,
    };
}

describe('SqlImportService – happy path', () => {
    const service = new SqlImportService();

    it('returns erContent starting with the ER header', async () => {
        const result = await service.importFromSql(makeParams('CREATE TABLE t (id INT);'));
        expect(result.error).toBeUndefined();
        expect(result.erContent).toMatch(/^erdiagram ImportedFromSql/);
    });

    it('FK schema: erContent contains entities and a relationship', async () => {
        const sql = `
            CREATE TABLE authors (id INT PRIMARY KEY);
            CREATE TABLE books (id INT, author_id INT, FOREIGN KEY (author_id) REFERENCES authors(id));
        `;
        const result = await service.importFromSql(makeParams(sql));
        expect(result.error).toBeUndefined();
        expect(result.erContent).toContain('entity Authors {');
        expect(result.erContent).toContain('entity Books {');
        expect(result.erContent).toContain('relationship AuthorsBooks {');
    });
});

describe('SqlImportService – error paths', () => {
    const service = new SqlImportService();

    it('returns an error when SQL has no CREATE TABLE', async () => {
        const result = await service.importFromSql(makeParams('SELECT 1;'));
        expect(result.erContent).toBe('');
        expect(result.error).toContain('No CREATE TABLE');
    });

    it('returns an error for completely unparseable SQL', async () => {
        const result = await service.importFromSql(makeParams('not sql at all %%%'));
        expect(result.erContent).toBe('');
        expect(result.error).toMatch(/Failed to parse SQL/);
    });

    it('error message includes the dialect name', async () => {
        const result = await service.importFromSql(makeParams('not sql at all %%%', 'PostgreSQL'));
        expect(result.error).toContain('PostgreSQL');
    });
});
