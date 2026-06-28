-- Many-to-many: a pure junction table (two FKs, nothing else). It disappears as
-- an entity and becomes one relationship: Category [0..N] -- [0..N] Product.
CREATE TABLE Category (
    id   INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE Product (
    id    INT NOT NULL,
    name  VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE product_categories (
    category_id INT NOT NULL,
    product_id  INT NOT NULL,
    PRIMARY KEY (category_id, product_id),
    FOREIGN KEY (category_id) REFERENCES Category(id),
    FOREIGN KEY (product_id)  REFERENCES Product(id)
);
