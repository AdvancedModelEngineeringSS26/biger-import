-- Self-reference: manager_id points back at Employee. The relationship is named
-- from the column (manager_id -> Manager), so it's EmployeeManager, not EmployeeEmployee.
CREATE TABLE Employee (
    id         INT NOT NULL,
    name       VARCHAR(100) NOT NULL,
    manager_id INT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (manager_id) REFERENCES Employee(id)
);
