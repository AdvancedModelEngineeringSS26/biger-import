-- PostgreSQL — double-quoted identifiers, named table-level FOREIGN KEY constraint
CREATE TABLE "customer" (
  "id" INT PRIMARY KEY,
  "email" VARCHAR(255)
);

CREATE TABLE "orders" (
  "id" INT PRIMARY KEY,
  "customer_id" INT NOT NULL,
  CONSTRAINT fk_orders_customer FOREIGN KEY ("customer_id") REFERENCES "customer" ("id")
);
