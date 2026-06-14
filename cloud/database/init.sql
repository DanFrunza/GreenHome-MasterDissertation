CREATE TABLE IF NOT EXISTS users (
    id                     SERIAL PRIMARY KEY,
    username               VARCHAR(100) UNIQUE NOT NULL,
    email                  VARCHAR(150) UNIQUE NOT NULL,
    password_hash          VARCHAR(255),
    display_name           VARCHAR(100),
    phone                  VARCHAR(20),
    timezone               VARCHAR(50)  DEFAULT 'Europe/Bucharest',
    language               VARCHAR(10)  DEFAULT 'en',
    notifications_enabled  BOOLEAN      DEFAULT TRUE,
    theme                  VARCHAR(20)  DEFAULT 'light',
    updated_at             TIMESTAMP    DEFAULT NOW(),
    created_at             TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homes (
    id           VARCHAR(50) PRIMARY KEY,
    name         VARCHAR(100),
    status       VARCHAR(20) DEFAULT 'offline',
    agent_status VARCHAR(20) DEFAULT 'offline',
    last_seen    TIMESTAMP,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_homes (
    user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
    home_id   VARCHAR(50) REFERENCES homes(id) ON DELETE CASCADE,
    role      VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, home_id)
);

CREATE TABLE IF NOT EXISTS entities (
    entity_id     VARCHAR(150),
    home_id       VARCHAR(50) REFERENCES homes(id) ON DELETE CASCADE,
    device_id     VARCHAR(150),
    domain        VARCHAR(30),
    friendly_name VARCHAR(150),
    unit          VARCHAR(20),
    device_class  VARCHAR(50),
    state              TEXT,
    available          BOOLEAN DEFAULT true,
    last_seen          TIMESTAMP,
    anomaly_muted      BOOLEAN DEFAULT false,
    anomaly_suppressed BOOLEAN DEFAULT false,
    PRIMARY KEY (home_id, entity_id)
);

CREATE TABLE IF NOT EXISTS measurements (
    id            SERIAL PRIMARY KEY,
    home_id       VARCHAR(50),
    entity_id     VARCHAR(150),
    value         TEXT,
    value_numeric FLOAT,
    recorded_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aggregations (
    id           SERIAL PRIMARY KEY,
    home_id      VARCHAR(50),
    entity_id    VARCHAR(150),
    period       VARCHAR(10),
    period_start TIMESTAMP,
    avg_value    FLOAT,
    min_value    FLOAT,
    max_value    FLOAT,
    count        INTEGER,
    computed_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE (home_id, entity_id, period, period_start)
);

CREATE TABLE IF NOT EXISTS automations (
    automation_id  VARCHAR(50),
    home_id        VARCHAR(50) REFERENCES homes(id) ON DELETE CASCADE,
    alias          VARCHAR(200),
    description    TEXT,
    enabled        BOOLEAN DEFAULT true,
    mode           VARCHAR(20) DEFAULT 'single',
    last_triggered TIMESTAMP,
    ha_entity_id   VARCHAR(150),
    raw_config     JSONB,
    PRIMARY KEY (home_id, automation_id)
);

CREATE TABLE IF NOT EXISTS automation_triggers (
    id             SERIAL PRIMARY KEY,
    automation_id  VARCHAR(50),
    home_id        VARCHAR(50),
    trigger_type   VARCHAR(50),
    entity_id      VARCHAR(150),
    above          FLOAT,
    below          FLOAT,
    from_state     VARCHAR(50),
    to_state       VARCHAR(50),
    at_time        VARCHAR(20),
    event_type     VARCHAR(100),
    FOREIGN KEY (home_id, automation_id) REFERENCES automations(home_id, automation_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS automation_conditions (
    id             SERIAL PRIMARY KEY,
    automation_id  VARCHAR(50),
    home_id        VARCHAR(50),
    condition_type VARCHAR(50),
    entity_id      VARCHAR(150),
    above          FLOAT,
    below          FLOAT,
    state_value    VARCHAR(50),
    after_time     VARCHAR(20),
    before_time    VARCHAR(20),
    template_text  TEXT,
    FOREIGN KEY (home_id, automation_id) REFERENCES automations(home_id, automation_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS automation_actions (
    id             SERIAL PRIMARY KEY,
    automation_id  VARCHAR(50),
    home_id        VARCHAR(50),
    action_order   INTEGER DEFAULT 0,
    action_type    VARCHAR(50),
    service        VARCHAR(100),
    entity_id      VARCHAR(150),
    delay          VARCHAR(20),
    topic          VARCHAR(200),
    payload        TEXT,
    FOREIGN KEY (home_id, automation_id) REFERENCES automations(home_id, automation_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_metadata (
    home_id        VARCHAR(50),
    device_id      VARCHAR(150),
    appliance_type VARCHAR(50),
    energy_class   VARCHAR(10),
    updated_at     TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (home_id, device_id)
);

CREATE TABLE IF NOT EXISTS home_config (
    home_id          VARCHAR(50) PRIMARY KEY REFERENCES homes(id) ON DELETE CASCADE,
    tariff_flat      NUMERIC(8,4),
    tariff_peak      NUMERIC(8,4),
    tariff_offpeak   NUMERIC(8,4),
    tariff_weekend   NUMERIC(8,4),
    peak_start       TIME,
    peak_end         TIME,
    currency         VARCHAR(10) DEFAULT 'RON',
    updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anomalies (
    id          SERIAL PRIMARY KEY,
    home_id     VARCHAR(50)  NOT NULL,
    entity_id   VARCHAR(150) NOT NULL,
    detected_at TIMESTAMP    NOT NULL,
    value       NUMERIC,
    mean        NUMERIC,
    std_dev     NUMERIC,
    z_score     NUMERIC,
    severity    VARCHAR(20)  NOT NULL,
    UNIQUE (home_id, entity_id, detected_at)
);
CREATE INDEX IF NOT EXISTS anomalies_home_detected ON anomalies (home_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS anomalies_entity ON anomalies (home_id, entity_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS predictions (
    id              SERIAL PRIMARY KEY,
    home_id         VARCHAR(50)  NOT NULL,
    entity_id       VARCHAR(150) NOT NULL,
    predicted_at    TIMESTAMP    NOT NULL,
    target_time     TIMESTAMP    NOT NULL,
    predicted_value FLOAT,
    model_type      VARCHAR(30)  NOT NULL,
    UNIQUE (home_id, entity_id, target_time)
);
CREATE INDEX IF NOT EXISTS predictions_home_entity ON predictions (home_id, entity_id, target_time);

CREATE TABLE IF NOT EXISTS meter_resets (
    id            SERIAL PRIMARY KEY,
    home_id       VARCHAR(50)  NOT NULL,
    entity_id     VARCHAR(150) NOT NULL,
    reset_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    value_before  NUMERIC,
    value_after   NUMERIC
);
CREATE INDEX IF NOT EXISTS meter_resets_entity_idx ON meter_resets (home_id, entity_id, reset_at DESC);

CREATE TABLE IF NOT EXISTS home_credentials (
    home_id            VARCHAR(50) PRIMARY KEY REFERENCES homes(id) ON DELETE CASCADE,
    mqtt_password_hash VARCHAR(255) NOT NULL,
    created_at         TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (username, email, password_hash)
VALUES ('demo-user', 'demo@greennest.me', 'demo')
ON CONFLICT DO NOTHING;

INSERT INTO homes (id, name, status) VALUES
  ('home1', 'Casa Demo',       'offline'),
  ('home2', 'Apartament Cluj', 'offline'),
  ('home3', 'Casa Bunicilor',  'offline')
ON CONFLICT DO NOTHING;

INSERT INTO user_homes (user_id, home_id, role) VALUES
  (1, 'home1', 'owner'),
  (1, 'home2', 'owner'),
  (1, 'home3', 'member')
ON CONFLICT DO NOTHING;

INSERT INTO home_config (home_id, tariff_flat, tariff_peak, tariff_offpeak, peak_start, peak_end, currency) VALUES
  ('home1', 0.8700, 1.1000, 0.5500, '07:00', '23:00', 'RON')
ON CONFLICT DO NOTHING;
