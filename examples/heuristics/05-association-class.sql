-- Association class: looks like a junction table, but it has an extra column
-- (quantity), so it stays an entity with two relationships instead of becoming
-- a many-to-many. (Compare with 06-many-to-many.sql.)
CREATE TABLE `Order` (
    id INT NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE Product (
    id    INT NOT NULL,
    name  VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE OrderItem (
    order_id   INT NOT NULL,
    product_id INT NOT NULL,
    quantity   INT NOT NULL,          -- extra column -> stays an entity
    PRIMARY KEY (order_id, product_id),
    FOREIGN KEY (order_id)   REFERENCES `Order`(id),
    FOREIGN KEY (product_id) REFERENCES Product(id)
);
