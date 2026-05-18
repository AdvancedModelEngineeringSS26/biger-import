import { describe, it, expect } from 'vitest';
import { analyzeSchema } from '../../src/import/schema-analyzer.js';
import { RelationshipType } from '@biger/common';
import type { SchemaModel, SchemaTable, SchemaColumn } from '../../src/import/schema-model.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeColumn(overrides: Partial<SchemaColumn> & { name: string }): SchemaColumn {
    return {
        dataType: { typeName: 'INT' },
        nullable: false,
        isPrimaryKey: false,
        isUnique: false,
        autoIncrement: false,
        ...overrides,
    };
}

function makeTable(overrides: Partial<SchemaTable> & { name: string }): SchemaTable {
    return {
        columns: [],
        primaryKey: undefined,
        foreignKeys: [],
        uniqueConstraints: [],
        checkConstraints: [],
        ...overrides,
    };
}

function makeModel(tables: SchemaTable[]): SchemaModel {
    return { dialect: 'MySQL', tables };
}

// ── Entity name derivation ─────────────────────────────────────────────────

describe('analyzeSchema – entity name derivation', () => {
    it('converts a lowercase table name to PascalCase', () => {
        const { entities } = analyzeSchema(makeModel([makeTable({ name: 'authors' })]));
        expect(entities[0].name).toBe('Authors');
    });

    it('converts snake_case to PascalCase', () => {
        const { entities } = analyzeSchema(makeModel([makeTable({ name: 'order_items' })]));
        expect(entities[0].name).toBe('OrderItems');
    });

    it('leaves an already-PascalCase name unchanged', () => {
        const { entities } = analyzeSchema(makeModel([makeTable({ name: 'Customer' })]));
        expect(entities[0].name).toBe('Customer');
    });

    it('handles a single-word mixed-case name', () => {
        const { entities } = analyzeSchema(makeModel([makeTable({ name: 'Order' })]));
        expect(entities[0].name).toBe('Order');
    });
});

// ── Attribute modifiers ────────────────────────────────────────────────────

describe('analyzeSchema – attribute modifiers', () => {
    it('assigns key modifier to a column with isPrimaryKey=true', () => {
        const table = makeTable({
            name: 't',
            columns: [makeColumn({ name: 'id', isPrimaryKey: true })],
        });
        const { entities } = analyzeSchema(makeModel([table]));
        expect(entities[0].attributes[0].modifier).toBe('key');
    });

    it('assigns key modifier to a column listed in primaryKey.columns', () => {
        const table = makeTable({
            name: 't',
            columns: [makeColumn({ name: 'id' })],
            primaryKey: { columns: ['id'] },
        });
        const { entities } = analyzeSchema(makeModel([table]));
        expect(entities[0].attributes[0].modifier).toBe('key');
    });

    it('assigns optional modifier to a nullable column', () => {
        const table = makeTable({
            name: 't',
            columns: [makeColumn({ name: 'email', nullable: true })],
        });
        const { entities } = analyzeSchema(makeModel([table]));
        expect(entities[0].attributes[0].modifier).toBe('optional');
    });

    it('assigns no modifier to a non-null, non-PK column', () => {
        const table = makeTable({
            name: 't',
            columns: [makeColumn({ name: 'name', nullable: false })],
        });
        const { entities } = analyzeSchema(makeModel([table]));
        expect(entities[0].attributes[0].modifier).toBeUndefined();
    });
});

// ── Data type formatting ───────────────────────────────────────────────────

describe('analyzeSchema – data type formatting', () => {
    it('formats a simple type', () => {
        const table = makeTable({
            name: 't',
            columns: [makeColumn({ name: 'x', dataType: { typeName: 'INT' } })],
        });
        const { entities } = analyzeSchema(makeModel([table]));
        expect(entities[0].attributes[0].dataType).toBe('INT');
    });

    it('formats a type with length', () => {
        const table = makeTable({
            name: 't',
            columns: [makeColumn({ name: 'x', dataType: { typeName: 'VARCHAR', length: 255 } })],
        });
        const { entities } = analyzeSchema(makeModel([table]));
        expect(entities[0].attributes[0].dataType).toBe('VARCHAR(255)');
    });

    it('formats a type with length and scale', () => {
        const table = makeTable({
            name: 't',
            columns: [makeColumn({ name: 'x', dataType: { typeName: 'DECIMAL', length: 10, scale: 2 } })],
        });
        const { entities } = analyzeSchema(makeModel([table]));
        expect(entities[0].attributes[0].dataType).toBe('DECIMAL(10, 2)');
    });
});

// ── Relationships ──────────────────────────────────────────────────────────

describe('analyzeSchema – relationships', () => {
    it('creates a relationship from a FOREIGN KEY', () => {
        const model = makeModel([
            makeTable({ name: 'authors' }),
            makeTable({
                name: 'books',
                columns: [makeColumn({ name: 'author_id' })],
                foreignKeys: [{
                    sourceColumns: ['author_id'],
                    referencedTable: 'authors',
                    referencedColumns: ['id'],
                }],
            }),
        ]);
        const { relationships } = analyzeSchema(model);
        expect(relationships).toHaveLength(1);
    });

    it('sets leftEntity to the referenced table entity, rightEntity to the owning table entity', () => {
        const model = makeModel([
            makeTable({ name: 'authors' }),
            makeTable({
                name: 'books',
                columns: [makeColumn({ name: 'author_id' })],
                foreignKeys: [{ sourceColumns: ['author_id'], referencedTable: 'authors', referencedColumns: ['id'] }],
            }),
        ]);
        const [rel] = analyzeSchema(model).relationships;
        expect(rel.leftEntity).toBe('Authors');
        expect(rel.rightEntity).toBe('Books');
    });

    it('uses RelationshipType.RELA_DEFAULT as the relationship kind', () => {
        const model = makeModel([
            makeTable({ name: 'authors' }),
            makeTable({
                name: 'books',
                columns: [makeColumn({ name: 'author_id' })],
                foreignKeys: [{ sourceColumns: ['author_id'], referencedTable: 'authors', referencedColumns: ['id'] }],
            }),
        ]);
        const [rel] = analyzeSchema(model).relationships;
        expect(rel.kind).toBe(RelationshipType.RELA_DEFAULT);
    });

    it('sets leftCardinality to 1', () => {
        const model = makeModel([
            makeTable({ name: 'authors' }),
            makeTable({
                name: 'books',
                columns: [makeColumn({ name: 'author_id' })],
                foreignKeys: [{ sourceColumns: ['author_id'], referencedTable: 'authors', referencedColumns: ['id'] }],
            }),
        ]);
        const [rel] = analyzeSchema(model).relationships;
        expect(rel.leftCardinality).toBe('1');
    });

    it('sets rightCardinality to 0..N', () => {
        const model = makeModel([
            makeTable({ name: 'authors' }),
            makeTable({
                name: 'books',
                columns: [makeColumn({ name: 'author_id' })],
                foreignKeys: [{ sourceColumns: ['author_id'], referencedTable: 'authors', referencedColumns: ['id'] }],
            }),
        ]);
        const [rel] = analyzeSchema(model).relationships;
        expect(rel.rightCardinality).toBe('0..N');
    });

    it('names the relationship as leftEntity + rightEntity', () => {
        const model = makeModel([
            makeTable({ name: 'authors' }),
            makeTable({
                name: 'books',
                columns: [makeColumn({ name: 'author_id' })],
                foreignKeys: [{ sourceColumns: ['author_id'], referencedTable: 'authors', referencedColumns: ['id'] }],
            }),
        ]);
        const [rel] = analyzeSchema(model).relationships;
        expect(rel.name).toBe('AuthorsBooks');
    });

    it('skips a FK that references a table not in the schema', () => {
        const model = makeModel([
            makeTable({
                name: 'books',
                columns: [makeColumn({ name: 'author_id' })],
                foreignKeys: [{ sourceColumns: ['author_id'], referencedTable: 'authors', referencedColumns: ['id'] }],
            }),
        ]);
        const { relationships } = analyzeSchema(model);
        expect(relationships).toHaveLength(0);
    });

    it('creates two relationships for two FKs from the same table', () => {
        const model = makeModel([
            makeTable({ name: 'customers' }),
            makeTable({ name: 'products' }),
            makeTable({
                name: 'orders',
                columns: [makeColumn({ name: 'customer_id' }), makeColumn({ name: 'product_id' })],
                foreignKeys: [
                    { sourceColumns: ['customer_id'], referencedTable: 'customers', referencedColumns: ['id'] },
                    { sourceColumns: ['product_id'], referencedTable: 'products', referencedColumns: ['id'] },
                ],
            }),
        ]);
        const { relationships } = analyzeSchema(model);
        expect(relationships).toHaveLength(2);
    });
});

// ── Edge cases ─────────────────────────────────────────────────────────────

describe('analyzeSchema – edge cases', () => {
    it('returns empty entities and relationships for an empty schema', () => {
        const result = analyzeSchema(makeModel([]));
        expect(result.entities).toHaveLength(0);
        expect(result.relationships).toHaveLength(0);
    });
});
