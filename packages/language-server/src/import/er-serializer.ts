import type { ErModel, ErEntity, ErRelationship } from './er-model.js';

export function serializeErModel(model: ErModel): string {
    const lines: string[] = ['erdiagram ImportedFromSql', 'notation = uml', ''];

    for (const entity of model.entities) {
        lines.push(...serializeEntity(entity));
    }

    for (const relationship of model.relationships) {
        lines.push(...serializeRelationship(relationship));
    }

    return lines.join('\n').trimEnd();
}

function serializeEntity(entity: ErEntity): string[] {
    const weak = entity.weak ? 'weak ' : '';
    const extendsClause = entity.extends ? ` extends ${entity.extends}` : '';
    const lines = [`${weak}entity ${entity.name}${extendsClause} {`];
    for (const attr of entity.attributes) {
        const dataType = attr.dataType ? `: ${attr.dataType}` : '';
        const modifier = attr.modifier ? ` ${attr.modifier}` : '';
        lines.push(`    ${attr.name}${dataType}${modifier}`);
    }
    lines.push('}', '');
    return lines;
}

function serializeRelationship(rel: ErRelationship): string[] {
    const weak = rel.weak ? 'weak ' : '';
    return [
        `${weak}relationship ${rel.name} {`,
        `    ${rel.leftEntity} [${rel.leftCardinality}] ${rel.kind} ${rel.rightEntity} [${rel.rightCardinality}]`,
        '}',
        '',
    ];
}
