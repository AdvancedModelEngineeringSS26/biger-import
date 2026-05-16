import { RelationshipType } from '@biger/common';

export type ErCardinality = '1' | '0..1' | '0..N' | '1..N' | 'N';
export type ErAttributeModifier = 'key' | 'optional';

export interface ErAttribute {
    readonly name: string;
    readonly dataType?: string;
    readonly modifier?: ErAttributeModifier;
}

export interface ErEntity {
    readonly name: string;
    readonly attributes: ErAttribute[];
}

export interface ErRelationship {
    readonly name: string;
    readonly leftEntity: string;
    readonly leftCardinality: ErCardinality;
    readonly rightEntity: string;
    readonly rightCardinality: ErCardinality;
    readonly kind: RelationshipType;
}

export interface ErModel {
    readonly entities: ErEntity[];
    readonly relationships: ErRelationship[];
}
