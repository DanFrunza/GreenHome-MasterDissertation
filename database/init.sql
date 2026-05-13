CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homes (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'offline',
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_homes (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    home_id VARCHAR(50) REFERENCES homes(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, home_id)
);

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    home_id VARCHAR(50) REFERENCES homes(id),
    device_id VARCHAR(100),
    source VARCHAR(20),
    available BOOLEAN DEFAULT false,
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(home_id, device_id)
);

CREATE TABLE IF NOT EXISTS device_attributes (
    id SERIAL PRIMARY KEY,
    home_id VARCHAR(50),
    device_id VARCHAR(100),
    attribute VARCHAR(50),
    unit VARCHAR(20),
    ha_entity_id VARCHAR(150),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(home_id, device_id, attribute)
);

CREATE TABLE IF NOT EXISTS measurements (
    id SERIAL PRIMARY KEY,
    home_id VARCHAR(50),
    device_id VARCHAR(100),
    attribute VARCHAR(50),
    value TEXT,
    value_numeric FLOAT,
    recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics (
    id SERIAL PRIMARY KEY,
    home_id VARCHAR(50),
    device_id VARCHAR(100),
    attribute VARCHAR(50),
    period VARCHAR(20),
    period_start TIMESTAMP,
    avg_value FLOAT,
    min_value FLOAT,
    max_value FLOAT,
    sum_value FLOAT,
    computed_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (username, email, password_hash)
VALUES ('demo-user', 'demo@greenhome.com', 'demo')
ON CONFLICT DO NOTHING;

INSERT INTO homes (id, name)
VALUES ('home1', 'Casa Demo')
ON CONFLICT DO NOTHING;

INSERT INTO user_homes (user_id, home_id, role)
VALUES (1, 'home1', 'owner')
ON CONFLICT DO NOTHING;