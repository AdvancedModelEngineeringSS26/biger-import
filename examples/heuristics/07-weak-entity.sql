-- Weak entity: a Bin can't exist without its Warehouse. PK is (warehouse_id,
-- bin_code) where warehouse_id is the FK and bin_code is its own discriminator.
-- Bin becomes a weak entity, bin_code is a partial_key.
CREATE TABLE Warehouse (
    id   INT NOT NULL,
    city VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE Bin (
    warehouse_id INT NOT NULL,
    bin_code     VARCHAR(10) NOT NULL,   -- partial key
    capacity     INT NULL,
    PRIMARY KEY (warehouse_id, bin_code),
    FOREIGN KEY (warehouse_id) REFERENCES Warehouse(id)
);
