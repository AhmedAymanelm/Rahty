from sqlalchemy import create_engine, text
from config import DATABASE_URL

db_url = DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(db_url)

sql = """
CREATE TABLE IF NOT EXISTS direct_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_direct_messages_sender_id ON direct_messages (sender_id);
CREATE INDEX IF NOT EXISTS ix_direct_messages_receiver_id ON direct_messages (receiver_id);
"""

with engine.begin() as conn:
    try:
        conn.execute(text(sql))
        print("Created direct_messages table successfully.")
    except Exception as e:
        print(f"Error creating table: {e}")
