-- MariaDB — MySQL-compatible flavor: backticks + inline AUTO_INCREMENT PRIMARY KEY
CREATE TABLE `customer` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255)
);

CREATE TABLE `orders` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`)
);
