-- Example 1: Simple table with inline primary key
CREATE TABLE Customer (
    id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    PRIMARY KEY (id)
);

-- Example 2: Table with two foreign keys
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
    product_id INT NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (customer_id) REFERENCES Customer(id),
    FOREIGN KEY (product_id) REFERENCES Product(id)
);
