-- ============================================================
-- SaveState v2 — MySQL Schema
-- Run once: mysql -u root -p savestate < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS savestate
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE savestate;

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username     VARCHAR(64)  NOT NULL UNIQUE,
    display_name VARCHAR(128) NOT NULL DEFAULT '',
    avatar_color VARCHAR(16)  NOT NULL DEFAULT '#3a8dde',
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login   TIMESTAMP    NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── User Preferences (key-value) ─────────────────────────────
CREATE TABLE IF NOT EXISTS user_prefs (
    user_id   INT UNSIGNED NOT NULL,
    pref_key  VARCHAR(64)  NOT NULL,
    pref_val  TEXT,
    PRIMARY KEY (user_id, pref_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Tickets ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             INT UNSIGNED NOT NULL,
    ticket_number       VARCHAR(64)  NOT NULL DEFAULT '',
    reason_for_contact  VARCHAR(255) NOT NULL DEFAULT '',
    type_of_device      VARCHAR(128) NOT NULL DEFAULT '',
    browser             VARCHAR(128) NOT NULL DEFAULT '',
    location            VARCHAR(255) NOT NULL DEFAULT '',
    obtained_info       TINYINT(1)   NOT NULL DEFAULT 0,
    has_account         TINYINT(1)   NOT NULL DEFAULT 0,
    escalated           TINYINT(1)   NOT NULL DEFAULT 0,
    contact_method      VARCHAR(64)  NOT NULL DEFAULT '',
    plan_type           VARCHAR(64)  NOT NULL DEFAULT '',
    solved              TINYINT(1)   NOT NULL DEFAULT 0,
    notes               TEXT,
    session_date        DATE         NOT NULL,
    exported_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_date  (user_id, session_date),
    INDEX idx_ticket_num (ticket_number),
    INDEX idx_solved     (user_id, solved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Arcade / RPG Progress ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS arcade_progress (
    user_id       INT UNSIGNED NOT NULL PRIMARY KEY,
    level         INT UNSIGNED NOT NULL DEFAULT 1,
    xp            INT UNSIGNED NOT NULL DEFAULT 0,
    total_tickets INT UNSIGNED NOT NULL DEFAULT 0,
    total_solved  INT UNSIGNED NOT NULL DEFAULT 0,
    streak_days   INT UNSIGNED NOT NULL DEFAULT 0,
    last_activity DATE         NULL,
    badges        TEXT         COMMENT 'JSON array of earned badge IDs',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Known Issues / Heads Up ──────────────────────────────────
CREATE TABLE IF NOT EXISTS known_issues (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL COMMENT 'Creator; 0 = global/shared',
    tag         VARCHAR(128) NOT NULL DEFAULT '' COMMENT 'e.g. PODCAST-NOPLAY',
    title       VARCHAR(255) NOT NULL,
    description TEXT         COMMENT 'What to tell the customer / how to handle',
    keywords    TEXT         COMMENT 'Comma-separated keywords for fuzzy matching',
    active      TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FULLTEXT INDEX ft_ki (title, description, keywords, tag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Improve ticket fulltext to include reason_for_contact for better matching
ALTER TABLE tickets ADD FULLTEXT INDEX ft_tickets_full
    (notes, ticket_number, reason_for_contact, location);

-- ── Ticket Image Attachments ─────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_images (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_id    INT UNSIGNED  NOT NULL,
    user_id      INT UNSIGNED  NOT NULL,
    filename     VARCHAR(255)  NOT NULL,
    orig_name    VARCHAR(255)  NOT NULL,
    mime_type    VARCHAR(64)   NOT NULL,
    file_size    INT UNSIGNED  NOT NULL,
    uploaded_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
    INDEX idx_ticket (ticket_id),
    INDEX idx_user   (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Seed: default guest user ──────────────────────────────────
INSERT IGNORE INTO users (id, username, display_name, avatar_color)
VALUES (1, 'guest', 'Guest', '#888888');

INSERT IGNORE INTO arcade_progress (user_id) VALUES (1);