export type SchemaDialect =
    | 'MySQL' | 'PostgreSQL'
    | 'Hive' | 'DB2' | 'FlinkSQL' | 'MariaDB' | 'Sqlite'
    | 'Snowflake' | 'Redshift'
    | 'TransactSQL' | 'BigQuery';

export interface SchemaModel {
    readonly dialect: SchemaDialect;
    readonly tables: SchemaTable[];
}

export interface SchemaTable {
    readonly name: string;
    readonly schema?: string;
    readonly columns: SchemaColumn[];
    readonly primaryKey: SchemaPrimaryKey | undefined;
    readonly foreignKeys: SchemaForeignKey[];
    readonly uniqueConstraints: SchemaUniqueConstraint[];
    readonly checkConstraints: SchemaCheckConstraint[];
}

export interface SchemaColumn {
    readonly name: string;
    readonly dataType: SchemaDataType;
    readonly nullable: boolean;
    readonly isPrimaryKey: boolean;
    readonly isUnique: boolean;
    readonly autoIncrement: boolean;
    readonly defaultValue?: string;
    readonly comment?: string;
}

export interface SchemaDataType {
    readonly typeName: string;
    readonly length?: number;
    readonly scale?: number;
}

export interface SchemaPrimaryKey {
    readonly constraintName?: string;
    readonly columns: string[];
}

export interface SchemaForeignKey {
    readonly constraintName?: string;
    readonly sourceColumns: string[];
    readonly referencedTable: string;
    readonly referencedSchema?: string;
    readonly referencedColumns: string[];
    readonly onDelete?: ReferentialAction;
    readonly onUpdate?: ReferentialAction;
}

export type ReferentialAction = 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';

export interface SchemaUniqueConstraint {
    readonly constraintName?: string;
    readonly columns: string[];
}

export interface SchemaCheckConstraint {
    readonly constraintName?: string;
}
