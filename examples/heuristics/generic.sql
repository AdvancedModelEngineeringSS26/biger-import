-- plain entity: column types, NULL/NOT NULL, UNIQUE, DEFAULT --------------------
CREATE TABLE User (
    id         INT          NOT NULL AUTO_INCREMENT,
    username   VARCHAR(50)  NOT NULL UNIQUE,
    email      VARCHAR(255) NOT NULL UNIQUE,
    bio        TEXT         NULL,                      -- optional
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);


-- ISA / inheritance: whole PK is also a FK to User -----------------------------
CREATE TABLE Admin (
    user_id        INT NOT NULL,
    access_level   INT NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id),
    FOREIGN KEY (user_id) REFERENCES User(id)
);


-- one-to-one: UNIQUE NOT NULL FK that is not the whole PK -----------------------
CREATE TABLE Profile (
    id          INT NOT NULL,
    user_id     INT NOT NULL UNIQUE,
    avatar_url  VARCHAR(255) NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES User(id)
);


-- one-to-many: plain (non-unique) FK -------------------------------------------
CREATE TABLE Post (
    id           INT          NOT NULL,
    title        VARCHAR(200) NOT NULL,
    body         TEXT         NOT NULL,
    author_id    INT          NOT NULL,
    published_at TIMESTAMP    NULL,                    -- optional (draft)
    PRIMARY KEY (id),
    FOREIGN KEY (author_id) REFERENCES User(id)
);


-- association class: junction WITH a payload column → stays an entity -----------
CREATE TABLE PostRevision (
    post_id     INT NOT NULL,
    editor_id   INT NOT NULL,
    edited_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- payload
    PRIMARY KEY (post_id, editor_id),
    FOREIGN KEY (post_id)   REFERENCES Post(id),
    FOREIGN KEY (editor_id) REFERENCES User(id)
);


-- weak entity + self-referencing FK + relationship name collision --------------
--   • (post_id, comment_no) PK: post_id is a FK subset → weak entity
--   • parent_comment_id is a self-FK → role-named EmployeeManager-style relation
--   • both author_id and post_id... plus moderator_id give two FKs to User
CREATE TABLE Comment (
    post_id           INT NOT NULL,
    comment_no        INT NOT NULL,                 -- partial key (discriminator)
    author_id         INT NOT NULL,
    moderator_id      INT NULL,                     -- second FK to User → name de-dup
    parent_comment_id INT NULL,                     -- self-reference
    body              TEXT NOT NULL,
    PRIMARY KEY (post_id, comment_no),
    FOREIGN KEY (post_id)           REFERENCES Post(id),
    FOREIGN KEY (author_id)         REFERENCES User(id),
    FOREIGN KEY (moderator_id)      REFERENCES User(id),
    FOREIGN KEY (parent_comment_id) REFERENCES Comment(post_id)
);


-- many-to-many: pure junction table, no payload → becomes a relationship --------
CREATE TABLE Tag (
    id   INT NOT NULL,
    name VARCHAR(50) NOT NULL UNIQUE,
    PRIMARY KEY (id)
);

CREATE TABLE post_tags (
    post_id INT NOT NULL,
    tag_id  INT NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES Post(id),
    FOREIGN KEY (tag_id)  REFERENCES Tag(id)
);
