-- Inheritance (ISA): the whole PK is also a FK, so the child shares the parent's
-- identity. PremiumCustomer becomes "extends Customer" instead of a relationship.
CREATE TABLE Customer (
    id   INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE PremiumCustomer (
    customer_id   INT NOT NULL,
    discount_rate DECIMAL(4, 2) NOT NULL,
    PRIMARY KEY (customer_id),
    FOREIGN KEY (customer_id) REFERENCES Customer(id)
);
