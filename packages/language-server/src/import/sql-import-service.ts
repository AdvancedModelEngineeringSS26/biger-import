import { Parser } from 'node-sql-parser';
import type { ImportSqlParams, ImportSqlResult } from '@biger/common';

type SqlNode = Record<string, unknown>;

export class SqlImportService {

    async importFromSql(params: ImportSqlParams): Promise<ImportSqlResult> {
        console.log(
            `[biger.import] Processing SQL import from ${params.sqlDocumentUri} into ${params.erDocumentUri}.`
        );
        console.log(`[biger.import] SQL content length: ${params.sqlContent.length}`);

        const parser = new Parser();
        let statements: SqlNode[];
        try {
            statements = asArray(parser.astify(params.sqlContent, { database: 'mysql' })).map(asNode);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return { erContent: '', error: `SQL parse error: ${message}` };
        }
        const tables = statements
            .filter(statement => readValue(statement, 'type') === 'create' && readValue(statement, 'keyword') === 'table')
            .map(statement => toTableModel(asNode(statement)))
            .filter((table): table is TableModel => table !== undefined);

        return {
            erContent: toErDiagram(tables)
        };
    }
}

interface TableModel {
    name: string;
    columns: ColumnModel[];
    foreignKeys: ForeignKeyModel[];
}

interface ColumnModel {
    name: string;
    datatype?: string;
    modifier?: 'key' | 'optional';
}

interface ForeignKeyModel {
    referencedTable: string;
}

function toTableModel(statement: SqlNode): TableModel | undefined {
    const name = toPascalCase(readTableName(readFirst(asArray(statement.table))));
    if (!name) {
        return undefined;
    }

    const definitions = asArray(statement.create_definitions).map(asNode);
    const primaryKeys = new Set(
        definitions
            .filter(definition => readValue(definition, 'resource') === 'constraint' && readValue(definition, 'constraint_type') === 'primary key')
            .flatMap(definition =>
                asArray(definition.definition)
                    .map(readColumnName)
                    .map(toIdentifier)
                    .filter(Boolean) as string[]
            )
    );

    return {
        name,
        columns: definitions
            .filter(definition => readValue(definition, 'resource') === 'column')
            .map(definition => toColumnModel(definition, primaryKeys))
            .filter((column): column is ColumnModel => column !== undefined),
        foreignKeys: definitions
            .filter(definition => readValue(definition, 'resource') === 'constraint' && readValue(definition, 'constraint_type') === 'FOREIGN KEY')
            .map(toForeignKeyModel)
            .filter((foreignKey): foreignKey is ForeignKeyModel => foreignKey !== undefined)
    };
}

function toColumnModel(definition: SqlNode, primaryKeys: Set<string>): ColumnModel | undefined {
    const name = toIdentifier(readColumnName(definition.column));
    if (!name) {
        return undefined;
    }

    const dataType = asNode(definition.definition);
    const length = readNumber(dataType, 'length');
    const scale = readNumber(dataType, 'scale');
    const datatype = typeof dataType.dataType === 'string'
        ? `${dataType.dataType}${length === undefined ? '' : `(${length}${scale === undefined ? '' : `, ${scale}`})`}`
        : undefined;
    const nullable = readValue(asNode(definition.nullable), 'type') === 'null';

    return {
        name,
        datatype,
        modifier: primaryKeys.has(name) || readValue(definition, 'primary') !== undefined ? 'key' : nullable ? 'optional' : undefined
    };
}

function toForeignKeyModel(definition: SqlNode): ForeignKeyModel | undefined {
    const reference = asNode(definition.reference_definition);
    const referencedTable = toPascalCase(readTableName(reference.table));
    return referencedTable ? { referencedTable } : undefined;
}

function toErDiagram(tables: TableModel[]): string {
    const relationshipNames = new Set<string>();
    const lines = ['erdiagram ImportedFromSql', 'notation = uml', ''];

    for (const table of tables) {
        lines.push(`entity ${table.name} {`);
        for (const column of table.columns) {
            lines.push(`    ${column.name}${column.datatype ? `: ${column.datatype}` : ''}${column.modifier ? ` ${column.modifier}` : ''}`);
        }
        lines.push('}', '');
    }

    for (const table of tables) {
        for (const foreignKey of table.foreignKeys) {
            const baseName = `${foreignKey.referencedTable}${table.name}`;
            const relationshipName = relationshipNames.has(baseName) ? `${baseName}Rel` : baseName;
            relationshipNames.add(relationshipName);
            lines.push(`relationship ${relationshipName} {`);
            lines.push(`    ${foreignKey.referencedTable} [1] -> ${table.name} [0..N]`);
            lines.push('}', '');
        }
    }

    return lines.join('\n').trimEnd();
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function asNode(value: unknown): SqlNode {
    return value !== null && typeof value === 'object' ? value as SqlNode : {};
}

function readFirst(value: unknown[]): unknown {
    return value[0];
}

function readValue(node: SqlNode, key: string): unknown {
    return node[key];
}

function readNumber(node: SqlNode, key: string): number | undefined {
    return typeof node[key] === 'number' ? node[key] : undefined;
}

function readTableName(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    const node = asNode(readFirst(asArray(value)));
    return typeof node.table === 'string' ? node.table : undefined;
}

function readColumnName(value: unknown): string | undefined {
    const node = asNode(value);
    if (typeof node.column === 'string') {
        return node.column;
    }
    const expr = asNode(node.expr);
    return typeof expr.column === 'string' ? expr.column : undefined;
}

function toPascalCase(value: string | undefined): string | undefined {
    const identifier = toIdentifier(value);
    return identifier ? identifier.replace(/(^|_)([a-z])/g, (_, _separator, char: string) => char.toUpperCase()) : undefined;
}

function toIdentifier(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }
    const identifier = value.replace(/[^\w]+/g, '_').replace(/^\d/, '_$&');
    return identifier || undefined;
}
