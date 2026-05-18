import { describe, it, expect } from 'vitest';
import { serializeErModel } from '../../src/import/er-serializer.js';
import { RelationshipType } from '@biger/common';
import type { ErModel, ErEntity, ErRelationship } from '../../src/import/er-model.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRelationship(overrides: Partial<ErRelationship> & { name: string; leftEntity: string; rightEntity: string }): ErRelationship {
    return {
        leftCardinality: '1',
        rightCardinality: '0..N',
        kind: RelationshipType.RELA_DEFAULT,
        ...overrides,
    };
}

function makeModel(entities: ErEntity[], relationships: ErRelationship[] = []): ErModel {
    return { entities, relationships };
}

// ── Header ─────────────────────────────────────────────────────────────────

describe('serializeErModel – header', () => {
    it('always starts with the ER diagram header', () => {
        const output = serializeErModel(makeModel([]));
        expect(output).toMatch(/^erdiagram ImportedFromSql\nnotation = uml/);
    });
});

// ── Empty model ────────────────────────────────────────────────────────────

describe('serializeErModel – empty model', () => {
    it('produces only the header for an empty model', () => {
        const output = serializeErModel(makeModel([]));
        expect(output).toBe('erdiagram ImportedFromSql\nnotation = uml');
    });
});

// ── Entity serialization ───────────────────────────────────────────────────

describe('serializeErModel – entity serialization', () => {
    it('wraps an entity in an entity block', () => {
        const output = serializeErModel(makeModel([{ name: 'User', attributes: [] }]));
        expect(output).toContain('entity User {');
        expect(output).toContain('}');
    });

    it('serializes an attribute with a data type', () => {
        const output = serializeErModel(makeModel([{
            name: 'User',
            attributes: [{ name: 'id', dataType: 'INT' }],
        }]));
        expect(output).toContain('    id: INT');
    });

    it('serializes an attribute with a key modifier', () => {
        const output = serializeErModel(makeModel([{
            name: 'User',
            attributes: [{ name: 'id', dataType: 'INT', modifier: 'key' }],
        }]));
        expect(output).toContain('    id: INT key');
    });

    it('serializes an attribute with an optional modifier', () => {
        const output = serializeErModel(makeModel([{
            name: 'User',
            attributes: [{ name: 'email', dataType: 'VARCHAR(100)', modifier: 'optional' }],
        }]));
        expect(output).toContain('    email: VARCHAR(100) optional');
    });

    it('serializes an attribute without a data type', () => {
        const output = serializeErModel(makeModel([{
            name: 'User',
            attributes: [{ name: 'tag' }],
        }]));
        expect(output).toContain('    tag');
        expect(output).not.toContain('    tag:');
    });

    it('includes all attributes of an entity', () => {
        const output = serializeErModel(makeModel([{
            name: 'Product',
            attributes: [
                { name: 'id', dataType: 'INT', modifier: 'key' },
                { name: 'name', dataType: 'VARCHAR(255)' },
                { name: 'price', dataType: 'DECIMAL(10, 2)' },
            ],
        }]));
        expect(output).toContain('    id: INT key');
        expect(output).toContain('    name: VARCHAR(255)');
        expect(output).toContain('    price: DECIMAL(10, 2)');
    });
});

// ── Relationship serialization ─────────────────────────────────────────────

describe('serializeErModel – relationship serialization', () => {
    it('wraps a relationship in a relationship block', () => {
        const rel = makeRelationship({ name: 'AuthorsBooks', leftEntity: 'Authors', rightEntity: 'Books' });
        const output = serializeErModel(makeModel([], [rel]));
        expect(output).toContain('relationship AuthorsBooks {');
        expect(output).toContain('}');
    });

    it('serializes the relationship body with correct entities and cardinalities', () => {
        const rel = makeRelationship({ name: 'AuthorsBooks', leftEntity: 'Authors', rightEntity: 'Books' });
        const output = serializeErModel(makeModel([], [rel]));
        expect(output).toContain('    Authors [1] -> Books [0..N]');
    });

    it('uses the relationship kind value as the arrow symbol', () => {
        const rel = makeRelationship({
            name: 'R',
            leftEntity: 'A',
            rightEntity: 'B',
            kind: RelationshipType.RELA_DEFAULT,
        });
        const output = serializeErModel(makeModel([], [rel]));
        expect(output).toContain('->');
    });
});

// ── Ordering and separation ────────────────────────────────────────────────

describe('serializeErModel – ordering and separation', () => {
    it('places all entity blocks before relationship blocks', () => {
        const entities: ErEntity[] = [
            { name: 'Authors', attributes: [] },
            { name: 'Books', attributes: [] },
        ];
        const rels = [makeRelationship({ name: 'AuthorsBooks', leftEntity: 'Authors', rightEntity: 'Books' })];
        const output = serializeErModel(makeModel(entities, rels));
        const entityPos = output.indexOf('entity Authors');
        const relPos = output.indexOf('relationship AuthorsBooks');
        expect(entityPos).toBeLessThan(relPos);
    });

    it('includes all entities when multiple are present', () => {
        const entities: ErEntity[] = [
            { name: 'A', attributes: [] },
            { name: 'B', attributes: [] },
            { name: 'C', attributes: [] },
        ];
        const output = serializeErModel(makeModel(entities));
        expect(output).toContain('entity A {');
        expect(output).toContain('entity B {');
        expect(output).toContain('entity C {');
    });

    it('includes all relationships when multiple are present', () => {
        const model = makeModel(
            [{ name: 'X', attributes: [] }, { name: 'Y', attributes: [] }, { name: 'Z', attributes: [] }],
            [
                makeRelationship({ name: 'XY', leftEntity: 'X', rightEntity: 'Y' }),
                makeRelationship({ name: 'YZ', leftEntity: 'Y', rightEntity: 'Z' }),
            ]
        );
        const output = serializeErModel(model);
        expect(output).toContain('relationship XY {');
        expect(output).toContain('relationship YZ {');
    });
});
