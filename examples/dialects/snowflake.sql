-- Snowflake — standard DDL with PRIMARY KEY / FOREIGN KEY constraints
-- (CLUSTER BY is Snowflake physical tuning and is not part of the logical ER model.)
CREATE TABLE customer (
  id INT PRIMARY KEY,
  email VARCHAR(255)
);

CREATE TABLE orders (
  id INT PRIMARY KEY,
  customer_id INT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customer(id)
);
