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
        queueLimit: 0,
        dateStrings: true,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
    });

    // 3. Crear tablas si no existen
    const usersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NULL,
            username VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            email VARCHAR(255) NULL,
            google_id VARCHAR(255) NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;
    await pool.query(usersTable);

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

    const appModulesTable = `
        CREATE TABLE IF NOT EXISTS app_modules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            module_key VARCHAR(50) NOT NULL UNIQUE,
            name VARCHAR(255) NOT NULL,
            base_price_cop DECIMAL(10,2) NOT NULL DEFAULT 0,
            annual_price_cop DECIMAL(10,2) NOT NULL DEFAULT 0,
            is_free TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    `;
    await pool.query(appModulesTable);

    const userSubscriptionsTable = `
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            module_key VARCHAR(50) NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            custom_price_cop DECIMAL(10,2) NULL,
            trial_ends_at DATETIME NULL,
            expires_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (module_key) REFERENCES app_modules(module_key) ON DELETE CASCADE,
            UNIQUE KEY user_module (user_id, module_key)
        ) ENGINE=InnoDB;
    `;
    await pool.query(userSubscriptionsTable);

    const userSettingsTable = `
        CREATE TABLE IF NOT EXISTS user_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            setting_key VARCHAR(50) NOT NULL,
            setting_value VARCHAR(255) NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY user_setting (user_id, setting_key)
        ) ENGINE=InnoDB;
    `;
    await pool.query(userSettingsTable);

    // --- MÓDULO HÁBITOS ---
    const habitsTable = `
        CREATE TABLE IF NOT EXISTS habits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            color VARCHAR(50) DEFAULT '#4caf50',
            type VARCHAR(20) NOT NULL DEFAULT 'habit',
            frequency VARCHAR(50) NOT NULL DEFAULT 'daily', 
            repeat_details VARCHAR(255) NULL, 
            start_date DATE NULL,
            start_time TIME NULL,
            end_time TIME NULL,
            reminder_time INT NULL,
            archived_date DATE NULL,
            active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.query(habitsTable);

    const pushTokensTable = `
        CREATE TABLE IF NOT EXISTS push_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token VARCHAR(255) NOT NULL,
            device_type VARCHAR(50) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY token_user (token, user_id)
        ) ENGINE=InnoDB;
    `;
    await pool.query(pushTokensTable);

    const habitLogsTable = `
        CREATE TABLE IF NOT EXISTS habit_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            habit_id INT NOT NULL,
            log_date DATE NOT NULL,
            completed TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
            UNIQUE KEY habit_date (habit_id, log_date)
        ) ENGINE=InnoDB;
    `;
    await pool.query(habitLogsTable);

    // --- MÓDULO GASTOS ---
    const expenseCategoriesTable = `
        CREATE TABLE IF NOT EXISTS expense_categories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            icon VARCHAR(50) DEFAULT 'wallet-outline',
            color VARCHAR(20) DEFAULT '#4caf50',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.query(expenseCategoriesTable);

    const expensesTable = `
        CREATE TABLE IF NOT EXISTS expenses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            category_id INT NOT NULL,
            month_year VARCHAR(10) NOT NULL,
            description VARCHAR(255) NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
            is_paid TINYINT(1) NOT NULL DEFAULT 0,
            is_recurring TINYINT(1) NOT NULL DEFAULT 0,
            is_reserved TINYINT(1) NOT NULL DEFAULT 0,
            reminder_date DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.query(expensesTable);

    const incomesTable = `
        CREATE TABLE IF NOT EXISTS incomes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            month_year VARCHAR(10) NOT NULL,
            description VARCHAR(255) NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.query(incomesTable);

    const suggestionsTable = `
        CREATE TABLE IF NOT EXISTS suggestions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            message TEXT NOT NULL,
            admin_reply TEXT NULL,
            status VARCHAR(50) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await pool.query(suggestionsTable);

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
