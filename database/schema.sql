-- =====================================================================
-- E & E Banaging Chips: complete schema
-- Run as root: mysql -u root -p < database\schema.sql
-- Requires MySQL 8.0.16+ (CHECK constraints are enforced from that version)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS banaging_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE banaging_db;

-- ---------------------------------------------------------------------
-- 1. Admin: staff accounts (login and registration)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin (
    admin_id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(50)  NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,               -- stores the hash, never plain text
    fullname    VARCHAR(100) NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. Customer
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer (
    customer_id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_name  VARCHAR(100) NOT NULL,
    city           VARCHAR(100) NULL,
    phone          VARCHAR(20)  NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. Product (flavors)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product (
    product_id  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    flavor      VARCHAR(100) NOT NULL UNIQUE,
    category    VARCHAR(50)  NOT NULL DEFAULT 'General',
    price       DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. Orders: one row per order
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    order_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admin_id     INT UNSIGNED NOT NULL,
    customer_id  INT UNSIGNED NOT NULL,
    order_date   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status       ENUM('pending','paid','completed','cancelled')
                 NOT NULL DEFAULT 'pending',
    INDEX idx_orders_date   (order_date),            -- dashboard date filters
    INDEX idx_orders_status (status),                -- status filters and KPIs
    CONSTRAINT fk_orders_admin
        FOREIGN KEY (admin_id) REFERENCES admin(admin_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_orders_customer
        FOREIGN KEY (customer_id) REFERENCES customer(customer_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. Order items: one row per flavor in an order
--    unit_price keeps the price at the time of sale
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    order_item_id  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id       INT UNSIGNED NOT NULL,
    product_id     INT UNSIGNED NOT NULL,
    quantity       INT UNSIGNED NOT NULL CHECK (quantity > 0),
    unit_price     DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    UNIQUE KEY uq_order_product (order_id, product_id),
    CONSTRAINT fk_items_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_items_product
        FOREIGN KEY (product_id) REFERENCES product(product_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. Archive tables: "Delete" moves the row here instead of erasing it.
--    No foreign keys on purpose: they are snapshots, so they never
--    block a deletion and keep working if the original row is gone.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deleted_products (
    deleted_id  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id  INT UNSIGNED NOT NULL,               -- the original ID
    flavor      VARCHAR(100) NOT NULL,
    category    VARCHAR(50)  NOT NULL,
    price       DECIMAL(10,2) NOT NULL,
    is_active   BOOLEAN NOT NULL,
    deleted_by  INT UNSIGNED NULL,                   -- admin_id who deleted it
    deleted_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS deleted_customers (
    deleted_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id    INT UNSIGNED NOT NULL,            -- the original ID
    customer_name  VARCHAR(100) NOT NULL,
    city           VARCHAR(100) NULL,
    phone          VARCHAR(20)  NULL,
    deleted_by     INT UNSIGNED NULL,
    deleted_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- App user: the website connects with this, never with root.
-- Change the password here AND in .env (DB_PASSWORD) so they match.
-- ---------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'banaging_user'@'localhost' IDENTIFIED BY 'banaging1234!';
GRANT SELECT, INSERT, UPDATE, DELETE ON banaging_db.* TO 'banaging_user'@'localhost';
FLUSH PRIVILEGES;