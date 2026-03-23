export const IMPORT_SQL_REQUEST = 'biger/importSql';

export interface ImportSqlParams {
    erDocumentUri: string;
    sqlDocumentUri: string;
    sqlContent: string;
}

export interface ImportSqlResult {
    erContent: string;
}
