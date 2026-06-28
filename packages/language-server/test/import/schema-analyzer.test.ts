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

    it('sets rightCardinality to 1..N for a NOT NULL FK', () => {
        const model = makeModel([
            makeTable({ name: 'authors' }),
            makeTable({
                name: 'books',
                columns: [makeColumn({ name: 'author_id' })],
                foreignKeys: [{ sourceColumns: ['author_id'], referencedTable: 'authors', referencedColumns: ['id'] }],
            }),
        ]);
        const [rel] = analyzeSchema(model).relationships;
        expect(rel.rightCardinality).toBe('1..N');
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

// ── Cardinality inference (nullable + UNIQUE) ───────────────────────────────

describe('analyzeSchema – cardinality inference', () => {
    function modelWithFk(column: Partial<SchemaColumn> & { name: string }, tableOverrides: Partial<SchemaTable> = {}) {
        return makeModel([
            makeTable({ name: 'parents' }),
            makeTable({
                name: 'children',
                columns: [makeColumn(column)],
                foreignKeys: [{ sourceColumns: [column.name], referencedTable: 'parents', referencedColumns: ['id'] }],
                ...tableOverrides,
            }),
        ]);
    }

    it('NOT NULL FK → right side 1..N (one-to-many, mandatory)', () => {
        const [rel] = analyzeSchema(modelWithFk({ name: 'parent_id', nullable: false })).relationships;
        expect(rel.rightCardinality).toBe('1..N');
    });

    it('nullable FK → right side 0..N (one-to-many, optional)', () => {
        const [rel] = analyzeSchema(modelWithFk({ name: 'parent_id', nullable: true })).relationships;
        expect(rel.rightCardinality).toBe('0..N');
    });

    it('NOT NULL FK on a UNIQUE column → right side 1 (one-to-one, mandatory)', () => {
        const [rel] = analyzeSchema(modelWithFk({ name: 'parent_id', nullable: false, isUnique: true })).relationships;
        expect(rel.rightCardinality).toBe('1');
    });

    it('nullable FK on a UNIQUE column → right side 0..1 (one-to-one, optional)', () => {
        const [rel] = analyzeSchema(modelWithFk({ name: 'parent_id', nullable: true, isUnique: true })).relationships;
        expect(rel.rightCardinality).toBe('0..1');
    });

    it('FK matching a UNIQUE constraint → one-to-one', () => {
        const model = modelWithFk(
            { name: 'parent_id', nullable: false },
            { uniqueConstraints: [{ columns: ['parent_id'] }] }
        );
        const [rel] = analyzeSchema(model).relationships;
        expect(rel.rightCardinality).toBe('1');
    });

    it('always sets leftCardinality to 1', () => {
        const [rel] = analyzeSchema(modelWithFk({ name: 'parent_id', nullable: true })).relationships;
        expect(rel.leftCardinality).toBe('1');
    });

    it('composite FK with one nullable source column → right side 0..N (not 1..N)', () => {
        const model = makeModel([
            makeTable({ name: 'parents' }),
            makeTable({
                name: 'children',
                columns: [
                    makeColumn({ name: 'parent_a', nullable: false }),
                    makeColumn({ name: 'parent_b', nullable: true }),
                ],
                foreignKeys: [{
                    sourceColumns: ['parent_a', 'parent_b'],
                    referencedTable: 'parents',
                    referencedColumns: ['a', 'b'],
                }],
            }),
        ]);
        const [rel] = analyzeSchema(model).relationships;
        expect(rel.rightCardinality).toBe('0..N');
    });
});

// ── Junction table → many-to-many ───────────────────────────────────────────

describe('analyzeSchema – junction table → M2M', () => {
    function junctionModel(extraColumns: SchemaColumn[] = []) {
        return makeModel([
            makeTable({ name: 'orders' }),
            makeTable({ name: 'products' }),
            makeTable({
                name: 'order_items',
                columns: [
                    makeColumn({ name: 'order_id' }),
                    makeColumn({ name: 'product_id' }),
                    ...extraColumns,
                ],
                primaryKey: { columns: ['order_id', 'product_id'] },
                foreignKeys: [
                    { sourceColumns: ['order_id'], referencedTable: 'orders', referencedColumns: ['id'] },
                    { sourceColumns: ['product_id'], referencedTable: 'products', referencedColumns: ['id'] },
                ],
            }),
        ]);
    }

    it('does not emit an entity for a pure junction table', () => {
        const { entities } = analyzeSchema(junctionModel());
        expect(entities.map(e => e.name)).toEqual(['Orders', 'Products']);
    });

    it('emits a single M2M relationship with 0..N on both sides', () => {
        const { relationships } = analyzeSchema(junctionModel());
        expect(relationships).toHaveLength(1);
        const [rel] = relationships;
        expect(rel.leftEntity).toBe('Orders');
        expect(rel.rightEntity).toBe('Products');
        expect(rel.leftCardinality).toBe('0..N');
        expect(rel.rightCardinality).toBe('0..N');
    });

    it('keeps a junction with a payload column as a normal entity (association class)', () => {
        const { entities, relationships } = analyzeSchema(junctionModel([makeColumn({ name: 'quantity' })]));
        expect(entities.map(e => e.name)).toContain('OrderItems');
        // payload junction yields two ordinary relationships, not one M2M
        expect(relationships).toHaveLength(2);
    });

    it('keeps a two-FK table with a surrogate PK as a normal entity (PK does not cover the FK columns)', () => {
        const model = makeModel([
            makeTable({ name: 'students' }),
            makeTable({ name: 'courses' }),
            makeTable({
                name: 'enrollment',
                columns: [
                    makeColumn({ name: 'id', isPrimaryKey: true }),
                    makeColumn({ name: 'student_id' }),
                    makeColumn({ name: 'course_id' }),
                ],
                primaryKey: { columns: ['id'] },
                foreignKeys: [
                    { sourceColumns: ['student_id'], referencedTable: 'students', referencedColumns: ['id'] },
                    { sourceColumns: ['course_id'], referencedTable: 'courses', referencedColumns: ['id'] },
                ],
            }),
        ]);
        const { entities, relationships } = analyzeSchema(model);
        expect(entities.map(e => e.name)).toContain('Enrollment');
        expect(relationships).toHaveLength(2);
    });

    it('does not treat the table as a junction when one referenced table is absent', () => {
        // products is missing from the schema, so order_items cannot become an M2M relationship
        const model = makeModel([
            makeTable({ name: 'orders' }),
            makeTable({
                name: 'order_items',
                columns: [makeColumn({ name: 'order_id' }), makeColumn({ name: 'product_id' })],
                primaryKey: { columns: ['order_id', 'product_id'] },
                foreignKeys: [
                    { sourceColumns: ['order_id'], referencedTable: 'orders', referencedColumns: ['id'] },
                    { sourceColumns: ['product_id'], referencedTable: 'products', referencedColumns: ['id'] },
                ],
            }),
        ]);
        const { entities, relationships } = analyzeSchema(model);
        expect(entities.map(e => e.name)).toContain('OrderItems');
        // only the resolvable FK (→ orders) yields a relationship
        expect(relationships).toHaveLength(1);
        expect(relationships[0].leftEntity).toBe('Orders');
    });
});

// ── Inheritance / ISA (PK = FK) ──────────────────────────────────────────────

describe('analyzeSchema – ISA / extends', () => {
    function isaModel() {
        return makeModel([
            makeTable({
                name: 'employee',
                columns: [makeColumn({ name: 'id', isPrimaryKey: true })],
                primaryKey: { columns: ['id'] },
            }),
            makeTable({
                name: 'manager',
                columns: [makeColumn({ name: 'id', isPrimaryKey: true })],
                primaryKey: { columns: ['id'] },
                foreignKeys: [{ sourceColumns: ['id'], referencedTable: 'employee', referencedColumns: ['id'] }],
            }),
        ]);
    }

    it('sets extends on the child entity to the parent entity', () => {
        const { entities } = analyzeSchema(isaModel());
        const manager = entities.find(e => e.name === 'Manager');
        expect(manager?.extends).toBe('Employee');
    });

    it('does not generate a relationship for the identifying FK', () => {
        const { relationships } = analyzeSchema(isaModel());
        expect(relationships).toHaveLength(0);
    });

    it('does not treat a self-referencing PK=FK as ISA', () => {
        const model = makeModel([
            makeTable({
                name: 'node',
                columns: [makeColumn({ name: 'id', isPrimaryKey: true })],
                primaryKey: { columns: ['id'] },
                foreignKeys: [{ sourceColumns: ['id'], referencedTable: 'node', referencedColumns: ['id'] }],
            }),
        ]);
        const { entities } = analyzeSchema(model);
        expect(entities[0].extends).toBeUndefined();
    });

    it('uses only the first qualifying FK for extends; additional PK=FK becomes a relationship', () => {
        // c.id is a FK to both a and b; only the first becomes `extends`, the second a relationship
        const model = makeModel([
            makeTable({ name: 'a', columns: [makeColumn({ name: 'id', isPrimaryKey: true })], primaryKey: { columns: ['id'] } }),
            makeTable({ name: 'b', columns: [makeColumn({ name: 'id', isPrimaryKey: true })], primaryKey: { columns: ['id'] } }),
            makeTable({
                name: 'c',
                columns: [makeColumn({ name: 'id', isPrimaryKey: true })],
                primaryKey: { columns: ['id'] },
                foreignKeys: [
                    { sourceColumns: ['id'], referencedTable: 'a', referencedColumns: ['id'] },
                    { sourceColumns: ['id'], referencedTable: 'b', referencedColumns: ['id'] },
                ],
            }),
        ]);
        const { entities, relationships } = analyzeSchema(model);
        expect(entities.find(e => e.name === 'C')?.extends).toBe('A');
        expect(relationships).toHaveLength(1);
        expect(relationships[0].leftEntity).toBe('B');
        expect(relationships[0].rightEntity).toBe('C');
    });
});

// ── Weak entities ────────────────────────────────────────────────────────────

describe('analyzeSchema – weak entities', () => {
    function weakModel() {
        return makeModel([
            makeTable({ name: 'building' }),
            makeTable({
                name: 'room',
                columns: [
                    makeColumn({ name: 'building_id' }),
                    makeColumn({ name: 'room_no' }),
                    makeColumn({ name: 'capacity', nullable: true }),
                ],
                primaryKey: { columns: ['building_id', 'room_no'] },
                foreignKeys: [{ sourceColumns: ['building_id'], referencedTable: 'building', referencedColumns: ['id'] }],
            }),
        ]);
    }

    it('marks the entity as weak', () => {
        const room = analyzeSchema(weakModel()).entities.find(e => e.name === 'Room');
        expect(room?.weak).toBe(true);
    });

    it('marks the discriminator column as partial_key and the borrowed key as key', () => {
        const room = analyzeSchema(weakModel()).entities.find(e => e.name === 'Room')!;
        const byName = Object.fromEntries(room.attributes.map(a => [a.name, a.modifier]));
        expect(byName['building_id']).toBe('key');
        expect(byName['room_no']).toBe('partial_key');
    });

    it('marks the identifying relationship as weak', () => {
        const [rel] = analyzeSchema(weakModel()).relationships;
        expect(rel.weak).toBe(true);
        expect(rel.leftEntity).toBe('Building');
        expect(rel.rightEntity).toBe('Room');
    });

    it('does not treat a table whose PK is entirely FK columns as weak', () => {
        // order_items below is a junction (precedence), never a weak entity
        const model = makeModel([
            makeTable({ name: 'orders' }),
            makeTable({ name: 'products' }),
            makeTable({
                name: 'order_items',
                columns: [makeColumn({ name: 'order_id' }), makeColumn({ name: 'product_id' })],
                primaryKey: { columns: ['order_id', 'product_id'] },
                foreignKeys: [
                    { sourceColumns: ['order_id'], referencedTable: 'orders', referencedColumns: ['id'] },
                    { sourceColumns: ['product_id'], referencedTable: 'products', referencedColumns: ['id'] },
                ],
            }),
        ]);
        const orderItems = analyzeSchema(model).entities.find(e => e.name === 'OrderItems');
        expect(orderItems).toBeUndefined();
    });

    it('does not treat a composite PK made entirely of FK columns (no discriminator) as weak', () => {
        // three single-column FKs covering the whole PK: not a junction (≠2 FKs) and not weak (no discriminator)
        const model = makeModel([
            makeTable({ name: 'x' }),
            makeTable({ name: 'y' }),
            makeTable({ name: 'z' }),
            makeTable({
                name: 'triple',
                columns: [makeColumn({ name: 'x_id' }), makeColumn({ name: 'y_id' }), makeColumn({ name: 'z_id' })],
                primaryKey: { columns: ['x_id', 'y_id', 'z_id'] },
                foreignKeys: [
                    { sourceColumns: ['x_id'], referencedTable: 'x', referencedColumns: ['id'] },
                    { sourceColumns: ['y_id'], referencedTable: 'y', referencedColumns: ['id'] },
                    { sourceColumns: ['z_id'], referencedTable: 'z', referencedColumns: ['id'] },
                ],
            }),
        ]);
        const { entities, relationships } = analyzeSchema(model);
        const triple = entities.find(e => e.name === 'Triple');
        expect(triple).toBeDefined();
        expect(triple?.weak).toBeUndefined();
        expect(relationships).toHaveLength(3);
        expect(relationships.every(r => r.weak === undefined)).toBe(true);
    });
});

// ── Self-referencing relationship naming ─────────────────────────────────────

describe('analyzeSchema – self-referencing relationships', () => {
    it('derives a role-based name from the FK column (manager_id → EmployeeManager)', () => {
        const model = makeModel([
            makeTable({
                name: 'employee',
                columns: [makeColumn({ name: 'id', isPrimaryKey: true }), makeColumn({ name: 'manager_id', nullable: true })],
                primaryKey: { columns: ['id'] },
                foreignKeys: [{ sourceColumns: ['manager_id'], referencedTable: 'employee', referencedColumns: ['id'] }],
            }),
        ]);
        const [rel] = analyzeSchema(model).relationships;
        expect(rel.name).toBe('EmployeeManager');
        expect(rel.leftEntity).toBe('Employee');
        expect(rel.rightEntity).toBe('Employee');
    });

    it('falls back to the default name for a composite self-referencing FK', () => {
        const model = makeModel([
            makeTable({
                name: 'employee',
                columns: [
                    makeColumn({ name: 'company_id' }),
                    makeColumn({ name: 'emp_no' }),
                    makeColumn({ name: 'mgr_company_id', nullable: true }),
                    makeColumn({ name: 'mgr_emp_no', nullable: true }),
                ],
                primaryKey: { columns: ['company_id', 'emp_no'] },
                foreignKeys: [{
                    sourceColumns: ['mgr_company_id', 'mgr_emp_no'],
                    referencedTable: 'employee',
                    referencedColumns: ['company_id', 'emp_no'],
                }],
            }),
        ]);
        const [rel] = analyzeSchema(model).relationships;
        expect(rel.name).toBe('EmployeeEmployee');
    });
});
