export const IMPORT_SQL_REQUEST = 'biger/importSql';

export type SqlDialect =
    | 'MySQL' | 'PostgreSQL'
    | 'Hive' | 'DB2' | 'FlinkSQL' | 'MariaDB' | 'Sqlite'
    | 'Snowflake' | 'Redshift'
    | 'TransactSQL' | 'BigQuery';

export interface HeuristicSettings {
    junction: boolean;
    inheritance: boolean;
    weakEntity: boolean;
    cardinality: boolean;
    selfReferenceNaming: boolean;
}

export interface ImportSqlParams {
    erDocumentUri: string;
    sqlDocumentUri: string;
    sqlContent: string;
    dialect: SqlDialect;
    /** Which heuristics to apply. Undefined means all enabled. */
    heuristics?: HeuristicSettings;
}

export interface ImportSqlResult {
    erContent: string;
    error?: string;
}
