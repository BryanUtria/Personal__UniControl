require('dotenv').config();
const mysql = require('mysql2/promise');

let pool;

async function initDB() {
    // 1. Conectar al servidor MySQL sin especificar base de datos para crearlo si no existe
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'unicontrol'}\``);
    await connection.end();

    // 2. Crear el pool de conexiones ya conectado a la base de datos
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'unicontrol',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    // 3. Crear tablas si no existen
    const usersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NULL,
            username VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            email VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;

    const verificationCodesTable = `
        CREATE TABLE IF NOT EXISTS verification_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            code VARCHAR(10) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;

    const productsTable = `
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10, 2) NOT NULL,
            stock INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;

    const salesTable = `
        CREATE TABLE IF NOT EXISTS sales (
            id INT AUTO_INCREMENT PRIMARY KEY,
            total DECIMAL(10, 2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;

    const saleItemsTable = `
        CREATE TABLE IF NOT EXISTS sale_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sale_id INT NOT NULL,
            product_id INT NOT NULL,
            quantity INT NOT NULL,
            price DECIMAL(10, 2) NOT NULL,
            subtotal DECIMAL(10, 2) NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB;
    `;

    const ordersTable = `
        CREATE TABLE IF NOT EXISTS orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reference VARCHAR(255) NOT NULL,
            status VARCHAR(50) DEFAULT 'pending',
            user_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;

    const orderItemsTable = `
        CREATE TABLE IF NOT EXISTS order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            product_id INT NOT NULL,
            quantity INT NOT NULL,
            price DECIMAL(10, 2) NOT NULL,
            subtotal DECIMAL(10, 2) NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;

    const debtorsTable = `
        CREATE TABLE IF NOT EXISTS debtors (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(255),
            identification VARCHAR(100),
            address VARCHAR(255),
            notes TEXT,
            type VARCHAR(20) NOT NULL DEFAULT 'client',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;

    const debtsTable = `
        CREATE TABLE IF NOT EXISTS debts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            debtor_id INT NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            quantity INT NOT NULL DEFAULT 1,
            description VARCHAR(255),
            type VARCHAR(50) NOT NULL DEFAULT 'debt',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;

    await pool.query(usersTable);
    await pool.query(verificationCodesTable);
    await pool.query(productsTable);
    await pool.query(salesTable);
    await pool.query(saleItemsTable);
    await pool.query(ordersTable);
    await pool.query(orderItemsTable);
    await pool.query(debtorsTable);

    // Migraciones seguras para columnas opcionales adicionales
    try { await pool.query('ALTER TABLE users ADD COLUMN name VARCHAR(255) NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE users ADD UNIQUE INDEX (email)'); } catch (e) {}

    try { await pool.query('ALTER TABLE debtors ADD COLUMN email VARCHAR(255) NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE debtors ADD COLUMN identification VARCHAR(100) NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE debtors ADD COLUMN address VARCHAR(255) NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE debtors ADD COLUMN notes TEXT NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE debtors ADD COLUMN user_id INT NULL'); } catch (e) {}
    try { await pool.query("ALTER TABLE debtors ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'client'"); } catch (e) {}

    // Isolación multiusuario (user_id)
    try { await pool.query('ALTER TABLE products ADD COLUMN user_id INT NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE products ADD COLUMN cost_price DECIMAL(10, 2) NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE products ADD COLUMN profit_margin DECIMAL(5, 2) NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE products ADD COLUMN code VARCHAR(100) NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE products ADD COLUMN min_stock INT NULL DEFAULT 5'); } catch (e) {}
    try { await pool.query('ALTER TABLE sales ADD COLUMN user_id INT NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE sales ADD COLUMN order_id INT NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE sales ADD COLUMN order_reference VARCHAR(255) NULL'); } catch (e) {}
    try { await pool.query('ALTER TABLE sales ADD COLUMN debtor_id INT NULL'); } catch (e) {}

    // Soft-delete: columna active
    try { await pool.query("ALTER TABLE products ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1"); } catch (e) {}
    try { await pool.query("ALTER TABLE debtors ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1"); } catch (e) {}
    // Agregar llaves foráneas opcionales si se desea
    try { await pool.query('ALTER TABLE debtors ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'); } catch (e) {}
    try { await pool.query('ALTER TABLE products ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'); } catch (e) {}
    try { await pool.query('ALTER TABLE sales ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'); } catch (e) {}

    await pool.query(debtsTable);

    const productBatchesTable = `
        CREATE TABLE IF NOT EXISTS product_batches (
            id INT AUTO_INCREMENT PRIMARY KEY,
            product_id INT NOT NULL,
            initial_quantity INT NOT NULL,
            quantity INT NOT NULL,
            cost_price DECIMAL(10, 2) NOT NULL,
            profit_margin DECIMAL(5, 2) NULL,
            price DECIMAL(10, 2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.query(productBatchesTable);

    // Migración inicial para mover el stock previo a lotes
    try {
        const productsWithoutBatches = await pool.query(
            `SELECT p.id, p.stock, p.price, p.cost_price, p.profit_margin 
             FROM products p 
             LEFT JOIN product_batches b ON p.id = b.product_id 
             WHERE b.id IS NULL AND p.stock > 0`
        );
        const rows = productsWithoutBatches[0];
        if (Array.isArray(rows)) {
            for (let prod of rows) {
                await pool.query(
                    'INSERT INTO product_batches (product_id, initial_quantity, quantity, cost_price, profit_margin, price) VALUES (?, ?, ?, ?, ?, ?)',
                    [prod.id, prod.stock, prod.stock, prod.cost_price || 0, prod.profit_margin || 0, prod.price]
                );
            }
        }
    } catch (migErr) {
        console.error('Error al migrar stock a lotes iniciales:', migErr);
    }

    console.log('Conectado a MySQL y tablas inicializadas con éxito.');
}

// Inicializar la base de datos al importar
const dbInitPromise = initDB().catch(err => {
    console.error('Error al inicializar la base de datos MySQL:', err);
});

// Helper para ejecutar consultas fácilmente
async function query(sql, params) {
    await dbInitPromise;
    const lowerSql = sql.trim().toLowerCase();
    if (!params || params.length === 0 || lowerSql.startsWith('start transaction') || lowerSql.startsWith('commit') || lowerSql.startsWith('rollback')) {
        const [results] = await pool.query(sql, params);
        return results;
    }
    const [results] = await pool.execute(sql, params);
    return results;
}

module.exports = {
    query,
    dbInitPromise
};
