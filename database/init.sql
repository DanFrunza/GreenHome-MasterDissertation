CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) UNIQUE NOT NULL,
    email         VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS homes (
    id         VARCHAR(50) PRIMARY KEY,
    name       VARCHAR(100),
    status     VARCHAR(20) DEFAULT 'offline',
    last_seen  TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
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
    state         TEXT,
    available     BOOLEAN DEFAULT true,
    last_seen     TIMESTAMP,
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

INSERT INTO users (username, email, password_hash)
VALUES ('demo-user', 'demo@greenhome.com', 'demo')
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
