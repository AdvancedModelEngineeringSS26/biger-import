-- Name collision: Shipment has two FKs to Warehouse. Both would be named
-- WarehouseShipment, so the second gets "Rel" -> WarehouseShipmentRel.
CREATE TABLE Warehouse (
    id   INT NOT NULL,
    city VARCHAR(100) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE Shipment (
    id                  INT NOT NULL,
    origin_warehouse_id INT NOT NULL,
    dest_warehouse_id   INT NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (origin_warehouse_id) REFERENCES Warehouse(id),
    FOREIGN KEY (dest_warehouse_id)   REFERENCES Warehouse(id)
);
