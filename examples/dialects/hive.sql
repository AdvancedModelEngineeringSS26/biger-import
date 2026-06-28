-- Apache Hive — standard CREATE TABLE with PRIMARY KEY / FOREIGN KEY constraints
CREATE TABLE customer (
  id INT,
  email VARCHAR(255),
  PRIMARY KEY (id)
);

CREATE TABLE orders (
  id INT,
  customer_id INT,
  PRIMARY KEY (id),
  FOREIGN KEY (customer_id) REFERENCES customer(id)
);
