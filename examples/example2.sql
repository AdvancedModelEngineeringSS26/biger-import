-- Example with a junction table (many-to-many between Order and Product)

CREATE TABLE Customer (
    id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    PRIMARY KEY (id)
);

CREATE TABLE Product (
    id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE `Order` (
    id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    customer_id INT NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (customer_id) REFERENCES Customer(id)
);

CREATE TABLE OrderItem (
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    PRIMARY KEY (order_id, product_id),
    FOREIGN KEY (order_id) REFERENCES `Order`(id),
    FOREIGN KEY (product_id) REFERENCES Product(id)
);
