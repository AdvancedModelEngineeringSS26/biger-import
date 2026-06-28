-- One-to-one: the FK is UNIQUE (but not the whole PK), so each customer has at
-- most one profile -> Customer [1] -- [1] CustomerProfile.
CREATE TABLE Customer (
    id   INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE CustomerProfile (
    id          INT NOT NULL,
    customer_id INT NOT NULL UNIQUE,
    bio         TEXT,
    PRIMARY KEY (id),
    FOREIGN KEY (customer_id) REFERENCES Customer(id)
);
