import type { ImportSqlParams, ImportSqlResult } from '@biger/common';
import { parseSql } from './sql-parser.js';
import { analyzeSchema } from './schema-analyzer.js';
import { serializeErModel } from './er-serializer.js';

export class SqlImportService {

    async importFromSql(params: ImportSqlParams): Promise<ImportSqlResult> {
        console.log(
            `[biger.import] Processing SQL import from ${params.sqlDocumentUri} into ${params.erDocumentUri}.`
        );
        console.log(`[biger.import] SQL content length: ${params.sqlContent.length}`);

        let schemaModel;
        try {
            schemaModel = parseSql(params.sqlContent, params.dialect);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return { erContent: '', error: `Failed to parse SQL as ${params.dialect}: ${message}` };
        }

        if (schemaModel.tables.length === 0) {
            return { erContent: '', error: 'No CREATE TABLE statements found in the SQL file.' };
        }

        const erModel = analyzeSchema(schemaModel);
        return { erContent: serializeErModel(erModel) };
    }
}
