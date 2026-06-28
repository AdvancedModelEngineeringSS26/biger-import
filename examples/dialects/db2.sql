-- IBM DB2 — schema-qualified table names (the "app." schema is normalized away)
CREATE TABLE app.customer (
  id INT NOT NULL,
  email VARCHAR(255),
  PRIMARY KEY (id)
);

CREATE TABLE app.orders (
  id INT NOT NULL,
  customer_id INT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (customer_id) REFERENCES app.customer(id)
);
