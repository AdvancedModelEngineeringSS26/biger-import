-- One-to-many: a plain (non-unique) FK. One customer has many orders
-- -> Customer [1] -- [1..N] Order. (ON DELETE CASCADE is parsed but not drawn.)
CREATE TABLE Customer (
    id   INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE `Order` (
    id          INT NOT NULL,
    order_date  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    customer_id INT NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (customer_id) REFERENCES Customer(id) ON DELETE CASCADE
);
