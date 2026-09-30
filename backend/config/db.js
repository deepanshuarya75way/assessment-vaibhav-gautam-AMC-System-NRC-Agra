const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const pool = new Pool({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "postgres",
    database: "railway_db",
    ssl: false
});
const connectDB = async () => {
    try {
        await pool.query('SELECT 1');
        console.log('PostgreSQL Connected successfully!');

        // --- TABLE 1: ADMINS ---
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                reset_password_token VARCHAR(255),
                reset_password_expires TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Admins table checked/created.');

        // --- TABLE 2: USERS ---
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                reset_password_token VARCHAR(255),
                reset_password_expires TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);`);
        console.log('Users table checked/created.');

        // --- TABLE 3: TECHNICIANS ---
        await pool.query(`
            CREATE TABLE IF NOT EXISTS technicians (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                reset_password_token VARCHAR(255),
                reset_password_expires TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Technicians table checked/created.');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_sessions (
               id SERIAL PRIMARY KEY,
               user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
               token TEXT NOT NULL,
               device VARCHAR(255),
               browser VARCHAR(255),
               ip_address VARCHAR(100),
               last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
               created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('User sessions table checked/created');

        // --- Sequence used to auto-generate ticket numbers like TCKT-000001 ---
        await pool.query(`CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;`);

        // --- Create complaints table (links to users + technicians) ---
        await pool.query(`
            CREATE TABLE IF NOT EXISTS complaints (
                id SERIAL PRIMARY KEY,
                ticket_number VARCHAR(20) UNIQUE NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                phone VARCHAR(20),
                product VARCHAR(255),
                department VARCHAR(255),
                subject VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'Pending',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Complaints table checked/created.');

        // --- Complaint history: a timeline/audit log of actions on each complaint ---
        await pool.query(`
            CREATE TABLE IF NOT EXISTS complaint_history (
                id SERIAL PRIMARY KEY,
                complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
                action VARCHAR(100) NOT NULL,
                performed_by VARCHAR(255),
                remarks TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Complaint history table checked/created.');

        // --- Notifications: messages sent to users (e.g. "your complaint is resolved") ---
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Notifications table checked/created.');

        // --- Create a default admin if none exists ---
        const adminEmail = 'admin@example.com';
        const adminExists = await pool.query('SELECT id FROM admins WHERE email = $1', [adminEmail]);

        if (adminExists.rows.length === 0) {
            const defaultAdminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'ChangeMe123!';
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(defaultAdminPassword, salt);

            await pool.query(
                'INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)',
                ['Default Admin', adminEmail, hashedPassword]
            );
            console.log(`Default admin created: ${adminEmail} (password: ${defaultAdminPassword})`);
        }

    } catch (err) {
        console.error('Database connection or schema creation error:', err);
        process.exit(1);
    }
};

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
    connectDB,
};
