CREATE TABLE authors (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE books (
    id INT PRIMARY KEY,
    author_id INT NOT NULL,
    title VARCHAR(255),
    CONSTRAINT fk_books_author FOREIGN KEY (author_id) REFERENCES authors(id)
);
