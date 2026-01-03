require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const migrations = [
    // Migration 001: Initial schema
    `CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_url VARCHAR(500) NOT NULL,
        payload JSONB NOT NULL,
        headers JSONB,
        signature VARCHAR(255),
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS delivery_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id UUID REFERENCES webhooks(id),
        attempt_number INTEGER NOT NULL,
        response_status INTEGER,
        response_body TEXT,
        error_message TEXT,
        attempted_at TIMESTAMP DEFAULT NOW(),
        duration_ms INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS dead_letter_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id UUID REFERENCES webhooks(id),
        reason TEXT NOT NULL,
        final_error TEXT,
        moved_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks(status)`,
    `CREATE INDEX IF NOT EXISTS idx_webhooks_created_at ON webhooks(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_delivery_attempts_webhook_id ON delivery_attempts(webhook_id)`,

    // Migration 002: API Keys
    `CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        key_hash VARCHAR(64) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW(),
        last_used_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true
    )`,
    `ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_webhooks_api_key_id ON webhooks(api_key_id)`
];

async function runMigrations() {
    console.log('Starting migrations...');

    try {
        for (let i = 0; i < migrations.length; i++) {
            const sql = migrations[i];
            console.log(`Running migration ${i + 1}/${migrations.length}...`);
            await pool.query(sql);
            console.log(`  ✓ Success`);
        }

        console.log('\n✅ All migrations completed successfully!');

        // Verify tables
        const result = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        console.log('\nTables created:');
        result.rows.forEach(row => console.log(`  - ${row.table_name}`));

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();
