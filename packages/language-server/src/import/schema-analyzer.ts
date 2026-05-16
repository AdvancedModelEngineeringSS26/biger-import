import { RelationshipType } from '@biger/common';
import type { SchemaModel, SchemaTable, SchemaColumn, SchemaForeignKey } from './schema-model.js';
import type { ErModel, ErEntity, ErAttribute, ErRelationship, ErCardinality } from './er-model.js';

export function analyzeSchema(schema: SchemaModel): ErModel {
    const entityNameByRawTable = new Map<string, string>();

    for (const table of schema.tables) {
        const entityName = deriveEntityName(table.name);
        if (entityName) {
            entityNameByRawTable.set(table.name.toLowerCase(), entityName);
        }
    }

    const entities: ErEntity[] = [];
    for (const table of schema.tables) {
        const name = entityNameByRawTable.get(table.name.toLowerCase());
        if (name) {
            entities.push({ name, attributes: toErAttributes(table) });
        }
    }

    const relationships = toErRelationships(schema.tables, entityNameByRawTable);

    return { entities, relationships };
}

function toErAttributes(table: SchemaTable): ErAttribute[] {
    const primaryKeyColumns = buildPrimaryKeySet(table);
    return table.columns.map(col => toErAttribute(col, primaryKeyColumns));
}

function toErAttribute(column: SchemaColumn, primaryKeyColumns: Set<string>): ErAttribute {
    const modifier = primaryKeyColumns.has(column.name)
        ? 'key' as const
        : column.nullable
            ? 'optional' as const
            : undefined;

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

function toErRelationships(
    tables: SchemaTable[],
    entityNameByRawTable: Map<string, string>
): ErRelationship[] {
    const usedNames = new Set<string>();
    const relationships: ErRelationship[] = [];

    for (const table of tables) {
        const rightEntity = entityNameByRawTable.get(table.name.toLowerCase());
        if (!rightEntity) {
            continue;
        }

        for (const fk of table.foreignKeys) {
            const rel = toErRelationship(fk, table, rightEntity, entityNameByRawTable, usedNames);
            if (rel) {
                relationships.push(rel);
            }
        }
    }

    return relationships;
}

function toErRelationship(
    fk: SchemaForeignKey,
    ownerTable: SchemaTable,
    rightEntity: string,
    entityNameByRawTable: Map<string, string>,
    usedNames: Set<string>
): ErRelationship | undefined {
    const leftEntity = entityNameByRawTable.get(fk.referencedTable.toLowerCase());
    if (!leftEntity) {
        return undefined;
    }

    const { leftCardinality, rightCardinality } = resolveCardinality(fk, ownerTable);
    const name = resolveRelationshipName(`${leftEntity}${rightEntity}`, usedNames);

    return {
        name,
        leftEntity,
        leftCardinality,
        rightEntity,
        rightCardinality,
        kind: RelationshipType.RELA_DEFAULT,
    };
}

function resolveCardinality(
    fk: SchemaForeignKey,
    ownerTable: SchemaTable
): { leftCardinality: ErCardinality; rightCardinality: ErCardinality } {
    const columnsByName = new Map(ownerTable.columns.map(c => [c.name.toLowerCase(), c]));
    const allNotNull = fk.sourceColumns.every(colName => {
        const col = columnsByName.get(colName.toLowerCase());
        return col !== undefined && !col.nullable;
    });

    return {
        leftCardinality: '1',
        rightCardinality: allNotNull ? '0..N' : '0..N',
    };
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
