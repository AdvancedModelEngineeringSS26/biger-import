-- Plain entity: shows how columns become attributes.
-- PK -> key, nullable -> optional, types like VARCHAR(100)/DECIMAL(10,2) are kept.
CREATE TABLE Customer (
    id          INT           NOT NULL AUTO_INCREMENT,
    name        VARCHAR(100)  NOT NULL,
    email       VARCHAR(255)  NOT NULL UNIQUE        COMMENT 'login identifier',
    phone       VARCHAR(20)   NULL,                   -- nullable -> optional
    balance     DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (id)
);
