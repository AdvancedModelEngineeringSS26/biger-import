-- Apache Flink SQL — the parser requires each statement on a single line (no newlines inside a statement)
CREATE TABLE customer (id INT PRIMARY KEY, email VARCHAR(255));
CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT NOT NULL, FOREIGN KEY (customer_id) REFERENCES customer(id));
