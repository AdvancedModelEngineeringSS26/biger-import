import { RelationshipType } from '@biger/common';
import type { SchemaModel, SchemaTable, SchemaColumn, SchemaForeignKey } from './schema-model.js';
import type {
    ErModel,
    ErEntity,
    ErAttribute,
    ErAttributeModifier,
    ErRelationship,
    ErCardinality,
} from './er-model.js';

/*
 Converts a parsed SQL {@link SchemaModel} into an {@link ErModel} by applying a set of
 structural heuristics. Each table is classified exactly once (see {@link classifyTable});
 the classification then drives both entity generation and relationship generation so the
 two stages always agree.
 */


export function analyzeSchema(schema: SchemaModel): ErModel {
    const entityNameByRawTable = new Map<string, string>();
    for (const table of schema.tables) {
        const entityName = deriveEntityName(table.name);
        if (entityName) {
            entityNameByRawTable.set(table.name.toLowerCase(), entityName);
        }
    }

    // Classify every table up front. Classification is precedence-ordered (junction > ISA > weak),
    // and is consumed by both buildEntities and buildRelationships.
    const classifications = new Map<string, TableClassification>();
    for (const table of schema.tables) {
        classifications.set(table.name.toLowerCase(), classifyTable(table, entityNameByRawTable));
    }

    const entities = buildEntities(schema.tables, entityNameByRawTable, classifications);
    const relationships = buildRelationships(schema.tables, entityNameByRawTable, classifications);

    return { entities, relationships };
}

// Table classification (heuristic detection)


/*
  The outcome of classifying a single table. At most one of the fields is set; an empty object
  means the table is a plain entity whose foreign keys become ordinary relationships.
 */
interface TableClassification {
    /** Pure bridge table: becomes a single many-to-many relationship instead of an entity. */
    readonly junction?: { readonly fkA: SchemaForeignKey; readonly fkB: SchemaForeignKey };
    /** ISA subtype: the identifying FK is rendered as an `extends` clause, not a relationship. */
    readonly isa?: { readonly parentEntity: string; readonly fk: SchemaForeignKey };
    /** Weak (existence-dependent) entity owned via `ownerFk`; `partialKeyColumns` are its discriminator. */
    readonly weak?: { readonly ownerFk: SchemaForeignKey; readonly partialKeyColumns: Set<string> };
}

function classifyTable(
    table: SchemaTable,
    entityNameByRawTable: Map<string, string>
): TableClassification {
    const pk = primaryKeyColumnsLower(table);

    const junction = detectJunction(table, pk, entityNameByRawTable);
    if (junction) {
        return { junction };
    }

    const isa = detectIsa(table, pk, entityNameByRawTable);
    if (isa) {
        return { isa };
    }

    const weak = detectWeak(table, pk, entityNameByRawTable);
    if (weak) {
        return { weak };
    }

    return {};
}

/*
 Junction / bridge table: exactly two FKs, a composite PK, and every column is part of an FK
 (no payload columns). Such a table models a many-to-many association and should not appear as an
 entity. A junction carrying extra columns (an "association class") fails the all-columns check
 and is kept as a normal entity instead.
 */
function detectJunction(
    table: SchemaTable,
    pk: Set<string>,
    entityNameByRawTable: Map<string, string>
): { fkA: SchemaForeignKey; fkB: SchemaForeignKey } | undefined {
    if (table.foreignKeys.length !== 2 || pk.size < 2) {
        return undefined;
    }
    const [fkA, fkB] = table.foreignKeys;
    if (
        !entityNameByRawTable.get(fkA.referencedTable.toLowerCase()) ||
        !entityNameByRawTable.get(fkB.referencedTable.toLowerCase())
    ) {
        return undefined;
    }

    const fkColumns = columnSet([...fkA.sourceColumns, ...fkB.sourceColumns]);
    const allColumns = columnSet(table.columns.map(c => c.name));

    // Every column must be an FK column, and the PK must cover exactly those columns.
    if (!setEquals(fkColumns, allColumns) || !setEquals(pk, fkColumns)) {
        return undefined;
    }

    return { fkA, fkB };
}

/*
 ISA / inheritance: the table's entire primary key equals one FK's source columns, so the child's
 identity *is* the parent's identity (the subtype pattern). Self-references are excluded — a table
 cannot extend itself. Only the first qualifying FK is used; additional FKs fall through to normal
 relationship generation (multiple inheritance is not modelled).
 */
function detectIsa(
    table: SchemaTable,
    pk: Set<string>,
    entityNameByRawTable: Map<string, string>
): { parentEntity: string; fk: SchemaForeignKey } | undefined {
    if (pk.size === 0) {
        return undefined;
    }
    for (const fk of table.foreignKeys) {
        if (fk.referencedTable.toLowerCase() === table.name.toLowerCase()) {
            continue;
        }
        if (setEquals(columnSet(fk.sourceColumns), pk)) {
            const parentEntity = entityNameByRawTable.get(fk.referencedTable.toLowerCase());
            if (parentEntity) {
                return { parentEntity, fk };
            }
        }
    }
    return undefined;
}

/*
 Weak entity: an FK's source columns form a proper subset of the PK, and the remaining PK
 columns include at least one genuine discriminator (a PK column that is not itself part of any
 FK). That discriminator is the partial key; the owning FK becomes an identifying relationship.

 The discriminator requirement is what distinguishes a weak entity from an association class such
 as OrderItem(order_id, product_id, quantity) whose PK is made up entirely of FK columns — that
 stays a normal entity with two relationships.
 */
function detectWeak(
    table: SchemaTable,
    pk: Set<string>,
    entityNameByRawTable: Map<string, string>
): { ownerFk: SchemaForeignKey; partialKeyColumns: Set<string> } | undefined {
    if (pk.size < 2) {
        return undefined;
    }

    const allFkColumns = columnSet(table.foreignKeys.flatMap(fk => fk.sourceColumns));

    for (const fk of table.foreignKeys) {
        if (fk.referencedTable.toLowerCase() === table.name.toLowerCase()) {
            continue;
        }
        const src = columnSet(fk.sourceColumns);
        if (src.size === 0 || src.size >= pk.size || !isSubset(src, pk)) {
            continue;
        }
        if (!entityNameByRawTable.get(fk.referencedTable.toLowerCase())) {
            continue;
        }

        const partialKeyColumns = new Set([...pk].filter(col => !src.has(col)));
        const hasDiscriminator = [...partialKeyColumns].some(col => !allFkColumns.has(col));
        if (hasDiscriminator) {
            return { ownerFk: fk, partialKeyColumns };
        }
    }
    return undefined;
}

// Entity generation


function buildEntities(
    tables: SchemaTable[],
    entityNameByRawTable: Map<string, string>,
    classifications: Map<string, TableClassification>
): ErEntity[] {
    const entities: ErEntity[] = [];
    for (const table of tables) {
        const name = entityNameByRawTable.get(table.name.toLowerCase());
        if (!name) {
            continue;
        }
        const classification = classifications.get(table.name.toLowerCase()) ?? {};
        if (classification.junction) {
            continue; // junction tables are modelled as a relationship, not an entity
        }

        entities.push({
            name,
            attributes: toErAttributes(table, classification),
            ...(classification.weak ? { weak: true } : {}),
            ...(classification.isa ? { extends: classification.isa.parentEntity } : {}),
        });
    }
    return entities;
}

function toErAttributes(table: SchemaTable, classification: TableClassification): ErAttribute[] {
    const primaryKeyColumns = buildPrimaryKeySet(table);
    const partialKeyColumns = classification.weak?.partialKeyColumns;
    return table.columns.map(col => toErAttribute(col, primaryKeyColumns, partialKeyColumns));
}

function toErAttribute(
    column: SchemaColumn,
    primaryKeyColumns: Set<string>,
    partialKeyColumns: Set<string> | undefined
): ErAttribute {
    let modifier: ErAttributeModifier | undefined;
    if (primaryKeyColumns.has(column.name)) {
        // A weak entity's discriminator is a partial key; borrowed-key columns stay regular keys.
        modifier = partialKeyColumns?.has(column.name.toLowerCase()) ? 'partial_key' : 'key';
    } else if (column.nullable) {
        modifier = 'optional';
    }

    return {
        name: column.name,
        dataType: formatDataType(column.dataType),
        modifier,
    };
}

function formatDataType(dataType: SchemaColumn['dataType']): string {
    const { typeName, length, scale } = dataType;
    if (length === undefined) {
        return typeName;
    }
    if (scale === undefined) {
        return `${typeName}(${length})`;
    }
    return `${typeName}(${length}, ${scale})`;
}

function buildPrimaryKeySet(table: SchemaTable): Set<string> {
    const columns = new Set<string>();

    if (table.primaryKey) {
        for (const col of table.primaryKey.columns) {
            columns.add(col);
        }
    }

    for (const col of table.columns) {
        if (col.isPrimaryKey) {
            columns.add(col.name);
        }
    }

    return columns;
}

// Relationship generation


function buildRelationships(
    tables: SchemaTable[],
    entityNameByRawTable: Map<string, string>,
    classifications: Map<string, TableClassification>
): ErRelationship[] {
    const usedNames = new Set<string>();
    const relationships: ErRelationship[] = [];

    for (const table of tables) {
        const classification = classifications.get(table.name.toLowerCase()) ?? {};

        if (classification.junction) {
            const rel = buildJunctionRelationship(classification.junction, entityNameByRawTable, usedNames);
            if (rel) {
                relationships.push(rel);
            }
            continue; // the two member FKs are represented by the single M2M relationship
        }

        const rightEntity = entityNameByRawTable.get(table.name.toLowerCase());
        if (!rightEntity) {
            continue;
        }

        for (const fk of table.foreignKeys) {
            if (classification.isa && classification.isa.fk === fk) {
                continue; // identifying ISA FK is expressed via `extends`
            }
            const isWeakOwner = classification.weak?.ownerFk === fk;
            const rel = toErRelationship(
                fk,
                table,
                rightEntity,
                entityNameByRawTable,
                usedNames,
                Boolean(isWeakOwner)
            );
            if (rel) {
                relationships.push(rel);
            }
        }
    }

    return relationships;
}

function buildJunctionRelationship(
    junction: { fkA: SchemaForeignKey; fkB: SchemaForeignKey },
    entityNameByRawTable: Map<string, string>,
    usedNames: Set<string>
): ErRelationship | undefined {
    const leftEntity = entityNameByRawTable.get(junction.fkA.referencedTable.toLowerCase());
    const rightEntity = entityNameByRawTable.get(junction.fkB.referencedTable.toLowerCase());
    if (!leftEntity || !rightEntity) {
        return undefined;
    }

    return {
        name: resolveRelationshipName(`${leftEntity}${rightEntity}`, usedNames),
        leftEntity,
        leftCardinality: '0..N',
        rightEntity,
        rightCardinality: '0..N',
        kind: RelationshipType.RELA_DEFAULT,
    };
}

function toErRelationship(
    fk: SchemaForeignKey,
    ownerTable: SchemaTable,
    rightEntity: string,
    entityNameByRawTable: Map<string, string>,
    usedNames: Set<string>,
    weak: boolean
): ErRelationship | undefined {
    const leftEntity = entityNameByRawTable.get(fk.referencedTable.toLowerCase());
    if (!leftEntity) {
        return undefined;
    }

    const { leftCardinality, rightCardinality } = resolveCardinality(fk, ownerTable);
    const baseName = deriveRelationshipBaseName(fk, ownerTable, leftEntity, rightEntity);
    const name = resolveRelationshipName(baseName, usedNames);

    return {
        name,
        leftEntity,
        leftCardinality,
        rightEntity,
        rightCardinality,
        kind: RelationshipType.RELA_DEFAULT,
        ...(weak ? { weak: true } : {}),
    };
}

/*
 Cardinality heuristic for the FK-bearing (right) side:
   FK covered by a UNIQUE constraint    one-to-one: `1` (all NOT NULL) or `0..1` (any nullable)
   otherwise                            one-to-many: `1..N` (all NOT NULL) or `0..N` (any nullable)
 
 The referenced (left) side is always 1 — a child row points at exactly one parent. This is a
 structural approximation from the DDL only; it is not a true min/max participation analysis.
 */

function resolveCardinality(
    fk: SchemaForeignKey,
    ownerTable: SchemaTable
): { leftCardinality: ErCardinality; rightCardinality: ErCardinality } {
    const columnsByName = new Map(ownerTable.columns.map(c => [c.name.toLowerCase(), c]));
    const allNotNull = fk.sourceColumns.every(colName => {
        const col = columnsByName.get(colName.toLowerCase());
        return col !== undefined && !col.nullable;
    });

    if (isUniqueForeignKey(fk, ownerTable)) {
        return { leftCardinality: '1', rightCardinality: allNotNull ? '1' : '0..1' };
    }

    return { leftCardinality: '1', rightCardinality: allNotNull ? '1..N' : '0..N' };
}

/* True when the FK source columns are guaranteed unique (single UNIQUE column or a UNIQUE constraint). */
function isUniqueForeignKey(fk: SchemaForeignKey, ownerTable: SchemaTable): boolean {
    if (fk.sourceColumns.length === 1) {
        const target = fk.sourceColumns[0].toLowerCase();
        if (ownerTable.columns.some(c => c.name.toLowerCase() === target && c.isUnique)) {
            return true;
        }
    }

    const src = columnSet(fk.sourceColumns);
    return ownerTable.uniqueConstraints.some(uc => setEquals(src, columnSet(uc.columns)));
}

/*
 Default relationship name is `{Parent}{Child}`. For a self-referencing FK with a single source
 column we derive a role from the column name (stripping a trailing `id`/`_id`) so an `Employee`
 pointing at itself via `manager_id` becomes `EmployeeManager` rather than `EmployeeEmployee`.
 Composite self-references fall back to the default name.
 */

function deriveRelationshipBaseName(
    fk: SchemaForeignKey,
    ownerTable: SchemaTable,
    leftEntity: string,
    rightEntity: string
): string {
    const selfReferencing = fk.referencedTable.toLowerCase() === ownerTable.name.toLowerCase();
    if (selfReferencing && fk.sourceColumns.length === 1) {
        const role = roleFromColumnName(fk.sourceColumns[0]);
        if (role) {
            return `${rightEntity}${role}`;
        }
    }
    return `${leftEntity}${rightEntity}`;
}

function roleFromColumnName(columnName: string): string | undefined {
    const stripped = columnName.replace(/[_-]?id$/i, '');
    return toPascalCase(stripped);
}

function resolveRelationshipName(baseName: string, usedNames: Set<string>): string {
    const name = usedNames.has(baseName) ? `${baseName}Rel` : baseName;
    usedNames.add(name);
    return name;
}

function deriveEntityName(rawName: string): string | undefined {
    return toPascalCase(toIdentifier(rawName));
}

function toPascalCase(value: string | undefined): string | undefined {
    const identifier = toIdentifier(value);
    return identifier
        ? identifier.replace(/(^|_)([a-z])/g, (_, _sep, char: string) => char.toUpperCase())
        : undefined;
}

function toIdentifier(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }
    const identifier = value.replace(/[^\w]+/g, '_').replace(/^\d/, '_$&');
    return identifier || undefined;
}

// helper functions

function primaryKeyColumnsLower(table: SchemaTable): Set<string> {
    return new Set([...buildPrimaryKeySet(table)].map(col => col.toLowerCase()));
}

function columnSet(names: string[]): Set<string> {
    return new Set(names.map(name => name.toLowerCase()));
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) {
        return false;
    }
    for (const value of a) {
        if (!b.has(value)) {
            return false;
        }
    }
    return true;
}

function isSubset(subset: Set<string>, superset: Set<string>): boolean {
    for (const value of subset) {
        if (!superset.has(value)) {
            return false;
        }
    }
    return true;
}
