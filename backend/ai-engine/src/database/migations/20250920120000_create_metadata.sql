CREATE TABLE IF NOT EXISTS extracted_metadata (
                                                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                  title TEXT NOT NULL,
                                                  difficulty TEXT NOT NULL,
                                                  genre TEXT NOT NULL,
                                                  summary TEXT NOT NULL
);