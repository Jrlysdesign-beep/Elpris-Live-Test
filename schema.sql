-- Isolated multi-user schema; never store plaintext passwords or access tokens.
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS charger_connections (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 charger_id TEXT NOT NULL,
 display_name TEXT,
 encrypted_refresh_credential TEXT,
 encrypted_access_token TEXT,
 access_expires_at TEXT,
 credential_expires_at TEXT,
 enabled INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(user_id,charger_id)
);
CREATE TABLE IF NOT EXISTS charging_sessions (
 id TEXT PRIMARY KEY,
 connection_id TEXT NOT NULL REFERENCES charger_connections(id),
 started_at TEXT NOT NULL,
 stopped_at TEXT,
 status TEXT NOT NULL,
 energy_kwh REAL,
 price_dkk REAL,
 price_quality TEXT NOT NULL DEFAULT 'unknown'
);
CREATE TABLE IF NOT EXISTS meter_readings (
 id TEXT PRIMARY KEY,
 connection_id TEXT NOT NULL REFERENCES charger_connections(id),
 session_id TEXT REFERENCES charging_sessions(id),
 observed_at TEXT NOT NULL,
 received_at TEXT NOT NULL,
 meter_kwh REAL,
 power_kw REAL,
 charging INTEGER,
 source TEXT NOT NULL,
 UNIQUE(connection_id,observed_at,source)
);
CREATE INDEX IF NOT EXISTS meter_readings_by_connection_time ON meter_readings(connection_id,observed_at);
CREATE TABLE IF NOT EXISTS quarter_prices (
 area TEXT NOT NULL,
 quarter_start_utc TEXT NOT NULL,
 price_dkk_kwh REAL NOT NULL,
 source TEXT NOT NULL,
 PRIMARY KEY(area,quarter_start_utc)
);

CREATE TABLE IF NOT EXISTS app_sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 expires_at TEXT NOT NULL,
 revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS app_sessions_by_user ON app_sessions(user_id);
