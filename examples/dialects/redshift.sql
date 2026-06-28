-- Amazon Redshift — standard logical DDL.
-- (DISTKEY / SORTKEY / ENCODE are Redshift physical-tuning clauses; they are not
--  part of the logical ER model and are omitted here so the import is clean.)
CREATE TABLE customer (
  id INT PRIMARY KEY,
  email VARCHAR(255)
);

CREATE TABLE orders (
  id INT PRIMARY KEY,
  customer_id INT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customer(id)
);
