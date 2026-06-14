const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.DB_HOST     || 'postgres-db',
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'mydb',
    user:     process.env.DB_USER     || 'user',
    password: process.env.DB_PASSWORD || 'password',
    max:                    10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis:      30000,
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});

// Error codes that indicate a transient connection problem worth retrying
const TRANSIENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '08006', '08001', '57P01']);

const _query = pool.query.bind(pool);

async function queryWithRetry(text, params, attempt = 0) {
    try {
        return await _query(text, params);
    } catch (err) {
        const transient = TRANSIENT.has(err.code) || err.message?.includes('timeout');
        if (transient && attempt < 3) {
            const delay = 100 * (2 ** attempt);   // 100 → 200 → 400 ms
            console.warn(`[DB] Transient error, retry ${attempt + 1}/3 in ${delay}ms — ${err.message}`);
            await new Promise(r => setTimeout(r, delay));
            return queryWithRetry(text, params, attempt + 1);
        }
        throw err;
    }
}

pool.query = queryWithRetry;

// Ensure meter_resets table exists (safe to run on every startup)
;(async () => {
    try {
        await _query(`
            CREATE TABLE IF NOT EXISTS meter_resets (
                id            SERIAL PRIMARY KEY,
                home_id       VARCHAR(50)  NOT NULL,
                entity_id     VARCHAR(150) NOT NULL,
                reset_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                value_before  NUMERIC,
                value_after   NUMERIC
            )
        `)
        await _query(`
            CREATE INDEX IF NOT EXISTS meter_resets_entity_idx
            ON meter_resets (home_id, entity_id, reset_at DESC)
        `)
    } catch (err) {
        console.error('[DB] Migration error:', err.message)
    }
})()

module.exports = pool;
