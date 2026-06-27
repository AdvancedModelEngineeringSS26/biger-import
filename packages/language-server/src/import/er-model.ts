import { RelationshipType } from '@biger/common';

export type ErCardinality = '1' | '0..1' | '0..N' | '1..N' | 'N';
export type ErAttributeModifier = 'key' | 'partial_key' | 'optional';

export interface ErAttribute {
    readonly name: string;
    readonly dataType?: string;
    readonly modifier?: ErAttributeModifier;
}

export interface ErEntity {
    readonly name: string;
    readonly attributes: ErAttribute[];
    /** Marks an existence-dependent weak entity (serialized with the `weak` keyword). */
    readonly weak?: boolean;
    /** Name of the parent entity this entity inherits from (ISA / `extends`). */
    readonly extends?: string;
}

export interface ErRelationship {
    readonly name: string;
    readonly leftEntity: string;
    readonly leftCardinality: ErCardinality;
    readonly rightEntity: string;
    readonly rightCardinality: ErCardinality;
    readonly kind: RelationshipType;
    /** Marks an identifying relationship between a weak entity and its owner. */
    readonly weak?: boolean;
}

export interface ErModel {
    readonly entities: ErEntity[];
    readonly relationships: ErRelationship[];
}
