-- SQLite — CREATE TABLE IF NOT EXISTS, table-level PK/FK constraints
CREATE TABLE IF NOT EXISTS customer (
  id INT NOT NULL PRIMARY KEY,
  email VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS orders (
  id INT NOT NULL PRIMARY KEY,
  customer_id INT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customer(id)
);
