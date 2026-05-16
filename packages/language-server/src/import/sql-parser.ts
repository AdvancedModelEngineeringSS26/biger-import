import { Parser } from 'node-sql-parser';
import type { SchemaModel, SchemaTable, SchemaColumn, SchemaDataType, SchemaPrimaryKey, SchemaForeignKey, SchemaUniqueConstraint, SchemaCheckConstraint, ReferentialAction, SchemaDialect } from './schema-model.js';

type SqlNode = Record<string, unknown>;

export function parseSql(sqlContent: string, dialect: SchemaDialect): SchemaModel {
    const parser = new Parser();
    const ast = toArray(parser.astify(sqlContent, { database: dialect }));

    const tables = ast
        .map(toNode)
        .filter(stmt => stmt['type'] === 'create' && stmt['keyword'] === 'table')
        .map(extractTable)
        .filter((t): t is SchemaTable => t !== undefined);

    return { dialect, tables };
}

function extractTable(stmt: SqlNode): SchemaTable | undefined {
    const tableField = stmt['table'];
    const tableRef = Array.isArray(tableField) ? toNode(tableField[0]) : toNode(tableField);
    const name = typeof tableRef['table'] === 'string' ? tableRef['table'] : undefined;
    if (!name) {
        return undefined;
    }
    const schema = typeof tableRef['db'] === 'string' && tableRef['db'] ? tableRef['db'] : undefined;

    const defs = toArray(stmt['create_definitions']).map(toNode);

    return {
        name,
        schema,
        columns: defs
            .filter(d => d['resource'] === 'column')
            .map(extractColumn)
            .filter((c): c is SchemaColumn => c !== undefined),
        primaryKey: extractPrimaryKey(defs),
        foreignKeys: defs
            .filter(d => d['resource'] === 'constraint' && d['constraint_type'] === 'FOREIGN KEY')
            .map(extractForeignKey)
            .filter((fk): fk is SchemaForeignKey => fk !== undefined),
        uniqueConstraints: defs
            .filter(d => d['resource'] === 'constraint' && isUniqueConstraintType(d['constraint_type']))
            .map(extractUniqueConstraint)
            .filter((u): u is SchemaUniqueConstraint => u !== undefined),
        checkConstraints: defs
            .filter(d => d['resource'] === 'constraint' && d['constraint_type'] === 'check')
            .map(extractCheckConstraint),
    };
}

function extractColumn(def: SqlNode): SchemaColumn | undefined {
    const name = extractColumnName(def['column']);
    if (!name) {
        return undefined;
    }

    const dataType = extractDataType(def['definition']);
    const nullableNode = toNode(def['nullable']);
    // 'null' means the column was explicitly declared NULL (nullable);
    // 'not null' or absent means the column is NOT NULL or unspecified.
    const nullable = nullableNode['type'] === 'null';

    return {
        name,
        dataType,
        nullable,
        isPrimaryKey: def['primary'] !== undefined,
        isUnique: def['unique'] !== undefined,
        autoIncrement: def['auto_increment'] !== undefined,
        defaultValue: extractDefaultValue(def['default_val']),
        comment: extractComment(def['comment']),
    };
}

function extractPrimaryKey(defs: SqlNode[]): SchemaPrimaryKey | undefined {
    const pkDef = defs.find(d => d['resource'] === 'constraint' && d['constraint_type'] === 'primary key');
    if (!pkDef) {
        return undefined;
    }

    return {
        constraintName: typeof pkDef['constraint'] === 'string' ? pkDef['constraint'] : undefined,
        columns: toArray(pkDef['definition'])
            .map(extractColumnName)
            .filter((c): c is string => c !== undefined),
    };
}

function extractForeignKey(def: SqlNode): SchemaForeignKey | undefined {
    const refDef = toNode(def['reference_definition']);
    const referencedRef = extractReferencedTableName(refDef['table']);
    if (!referencedRef) {
        return undefined;
    }

    const { onDelete, onUpdate } = extractReferentialActions(refDef['on_action']);

    return {
        constraintName: typeof def['constraint'] === 'string' ? def['constraint'] : undefined,
        sourceColumns: toArray(def['definition'])
            .map(extractColumnName)
            .filter((c): c is string => c !== undefined),
        referencedTable: referencedRef.name,
        referencedSchema: referencedRef.schema,
        referencedColumns: toArray(refDef['definition'])
            .map(extractColumnName)
            .filter((c): c is string => c !== undefined),
        onDelete,
        onUpdate,
    };
}

function extractUniqueConstraint(def: SqlNode): SchemaUniqueConstraint | undefined {
    const columns = toArray(def['definition'])
        .map(extractColumnName)
        .filter((c): c is string => c !== undefined);

    if (columns.length === 0) {
        return undefined;
    }

    return {
        constraintName: typeof def['constraint'] === 'string' ? def['constraint'] : undefined,
        columns,
    };
}

function extractCheckConstraint(def: SqlNode): SchemaCheckConstraint {
    return {
        constraintName: typeof def['constraint'] === 'string' ? def['constraint'] : undefined,
    };
}

function extractDataType(value: unknown): SchemaDataType {
    const node = toNode(value);
    const typeName = typeof node['dataType'] === 'string' ? node['dataType'].toUpperCase() : 'UNKNOWN';
    const length = typeof node['length'] === 'number' ? node['length'] : undefined;
    const scale = typeof node['scale'] === 'number' ? node['scale'] : undefined;
    return { typeName, length, scale };
}

// Handles all three shapes node-sql-parser uses for column references:
//   shape A: { column: string }
//   shape B: { column: { expr: { column: string } } }
//   shape C: { expr: { column: string } }
function extractColumnName(value: unknown): string | undefined {
    const node = toNode(value);
    if (typeof node['column'] === 'string') {
        return node['column'];
    }
    const expr = toNode(node['expr']);
    if (typeof expr['column'] === 'string') {
        return expr['column'];
    }
    const inner = toNode(node['column']);
    const innerExpr = toNode(inner['expr']);
    return typeof innerExpr['column'] === 'string' ? innerExpr['column'] : undefined;
}

// Handles three shapes node-sql-parser uses for referenced table names:
//   shape A: string
//   shape B: { table: string, db?: string }
//   shape C: [{ table: string, db?: string }]
function extractReferencedTableName(value: unknown): { name: string; schema?: string } | undefined {
    if (typeof value === 'string') {
        return { name: value };
    }
    const ref = Array.isArray(value) ? toNode(value[0]) : toNode(value);
    const name = typeof ref['table'] === 'string' ? ref['table'] : undefined;
    if (!name) {
        return undefined;
    }
    const schema = typeof ref['db'] === 'string' && ref['db'] ? ref['db'] : undefined;
    return { name, schema };
}

function extractReferentialActions(value: unknown): { onDelete?: ReferentialAction; onUpdate?: ReferentialAction } {
    const actions = toArray(value).map(toNode);
    let onDelete: ReferentialAction | undefined;
    let onUpdate: ReferentialAction | undefined;

    for (const action of actions) {
        const type = typeof action['type'] === 'string' ? action['type'].toLowerCase() : '';
        const valueNode = toNode(action['value']);
        const raw = typeof valueNode['value'] === 'string' ? valueNode['value'] : undefined;
        const referentialAction = toReferentialAction(raw);

        if (type === 'on delete') {
            onDelete = referentialAction;
        } else if (type === 'on update') {
            onUpdate = referentialAction;
        }
    }

    return { onDelete, onUpdate };
}

function toReferentialAction(raw: string | undefined): ReferentialAction | undefined {
    if (!raw) {
        return undefined;
    }
    const upper = raw.toUpperCase();
    switch (upper) {
        case 'CASCADE': return 'CASCADE';
        case 'SET NULL': return 'SET NULL';
        case 'SET DEFAULT': return 'SET DEFAULT';
        case 'RESTRICT': return 'RESTRICT';
        case 'NO ACTION': return 'NO ACTION';
        default: return undefined;
    }
}

function extractDefaultValue(value: unknown): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    const node = toNode(value);
    const val = node['value'];
    if (val === undefined || val === null) {
        return undefined;
    }
    const inner = toNode(val);
    if (typeof inner['value'] !== 'undefined') {
        return String(inner['value']);
    }
    return typeof val === 'string' || typeof val === 'number' ? String(val) : undefined;
}

function extractComment(value: unknown): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    const node = toNode(value);
    const raw = node['value'];
    if (typeof raw !== 'string') {
        return undefined;
    }
    return raw.replace(/^['"]|['"]$/g, '');
}

function isUniqueConstraintType(constraintType: unknown): boolean {
    return constraintType === 'unique key' || constraintType === 'unique' || constraintType === 'unique index';
}

function toArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
        return value;
    }
    return value === undefined || value === null ? [] : [value];
}

function toNode(value: unknown): SqlNode {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as SqlNode
        : {};
}
