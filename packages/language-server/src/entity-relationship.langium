grammar EntityRelationship

entry Model:
    'erdiagram' name=ID
    (notation=NotationOption?)
    (entities+=Entity | relationships+=Relationship)*; // e.g. erdiagram CustomerOrder {...}

NotationOption:
    'notation' '=' notationType=NotationType; // e.g. notation=chen

Entity: 
    (weak?='weak')? 'entity' name=ID ('extends' extends=[Entity])? '{'
        (attributes+=Attribute)*
    '}'; // e.g. entity Customer extends Person {...}

Relationship:
    (weak?='weak')? 'relationship' name=ID '{'
        source=RelationEntity (targets+=RelationTarget)+
        (attributes+=Attribute)*
    '}'; // e.g. relationship Placed {Customer[...]->Order[...]}

RelationTarget:
    type=RelationshipType relationEntity=RelationEntity;

RelationEntity:
    entity=[Entity:ID] ('[' 
        cardinality=CardinalityType ('|' role=STRING)? 
    ']')?; // e.g. Customer[1|Buyer]

Attribute:
    (visibility=VisibilityType)? name=ID (':' datatype=DataType)? (type=AttributeType)?; // e.g. +size: float(...) optional

DataType:
    type=ID ('(' size=INT (',' d=INT)? ')')?; // e.g. float(255, 2) | d specifies the number of digits after the decimal point

AttributeType:
    ATTR_NONE = 'none' |
    KEY = 'key' |
    PARTIAL_KEY = 'partial_key' |
    OPTIONAL = 'optional' |
    DERIVED = 'derived' |
    MULTIVALUED = 'multivalued';

CardinalityType:
    CARD_NONE = 'none' |
    ZERO_OR_ONE = '0..1' |
    ZERO_OR_MORE = '0..N' |
    ONE = '1' | ONE = '1..1' |
    MANY = 'N' | MANY = '1..N';

NotationType:
    NOTA_DEFAULT = 'default' |
    CHEN = 'chen' |
    BACHMAN = 'bachman' |
    CROWSFOOT = 'crowfoot' |
    UML = 'uml';

RelationshipType:
    RELA_DEFAULT = '->' |
    AGGREGATION_LEFT = 'o-' | AGGREGATION_RIGHT = '-o' |
    COMPOSITION_LEFT = '*-' | COMPOSITION_RIGHT = '-*';

VisibilityType:
    VISI_NONE = 'none' |
    PUBLIC = 'public' | PUBLIC = '+' |
    PROTECTED = 'protected' | PROTECTED = '#' |
    PRIVATE = 'private' | PRIVATE = '-' |
    PACKAGE = 'package' | PACKAGE = '~';


hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal INT returns number: /[0-9]+/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
