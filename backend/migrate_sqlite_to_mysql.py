"""Copy the current SQLite data into a new, empty MySQL database.

Run from the backend directory after configuring DB_* in backend/.env.
The script leaves the SQLite database and audio files unchanged and refuses
to copy into a MySQL database that already contains application tables.
"""

from pathlib import Path
import os
import sys

from dotenv import load_dotenv
from sqlalchemy import MetaData, create_engine, inspect, select
from sqlalchemy.engine import URL


BACKEND_DIR = Path(__file__).resolve().parent
SQLITE_PATH = BACKEND_DIR / "music_streamer.db"

load_dotenv(BACKEND_DIR / ".env")

# Import every model currently used by the application so Base.metadata knows
# the complete schema before it creates the destination tables.
sys.path.insert(0, str(BACKEND_DIR))
from app.database import Base  # noqa: E402
from app.models.analysis_job import AnalysisJob  # noqa: F401,E402
from app.models.download import Download  # noqa: F401,E402
from app.models.email_verification_token import EmailVerificationToken  # noqa: F401,E402
from app.models.password_reset_token import PasswordResetToken  # noqa: F401,E402
from app.models.refresh_token import RefreshToken  # noqa: F401,E402
from app.models.song import Song  # noqa: F401,E402
from app.models.song_emotion import SongEmotion  # noqa: F401,E402
from app.models.user import User  # noqa: F401,E402
from app.models.userpreference import UserPreference  # noqa: F401,E402


def main():
    if not SQLITE_PATH.is_file():
        raise SystemExit(f"SQLite database not found: {SQLITE_PATH}")

    required = ("DB_USER", "DB_PASSWORD", "DB_HOST", "DB_NAME")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise SystemExit(
            "Set these MySQL values in backend/.env before migrating: "
            + ", ".join(missing)
        )

    sqlite_engine = create_engine(f"sqlite:///{SQLITE_PATH.as_posix()}")
    mysql_url = URL.create(
        "mysql+pymysql",
        username=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        database=os.environ["DB_NAME"],
    )
    mysql_engine = create_engine(mysql_url)

    source_tables = set(inspect(sqlite_engine).get_table_names()) - {"sqlite_sequence"}
    known_tables = set(Base.metadata.tables)
    unknown_tables = source_tables - known_tables
    if unknown_tables:
        raise SystemExit(
            "SQLite contains tables not represented by the current app models; "
            "migration stopped to avoid losing data: "
            + ", ".join(sorted(unknown_tables))
        )

    existing_mysql_tables = set(inspect(mysql_engine).get_table_names())
    if existing_mysql_tables:
        raise SystemExit(
            "The MySQL database is not empty; migration stopped without changing it. "
            "Use a fresh database name for this migration. Existing tables: "
            + ", ".join(sorted(existing_mysql_tables))
        )

    Base.metadata.create_all(mysql_engine)
    metadata = MetaData()
    metadata.reflect(bind=sqlite_engine, only=sorted(source_tables))

    copied = {}
    with sqlite_engine.connect() as source, mysql_engine.begin() as destination:
        for table in Base.metadata.sorted_tables:
            if table.name not in source_tables:
                continue
            source_table = metadata.tables[table.name]
            rows = source.execute(select(source_table)).mappings()
            count = 0
            batch = []
            for row in rows:
                batch.append(dict(row))
                if len(batch) == 500:
                    destination.execute(table.insert(), batch)
                    count += len(batch)
                    batch.clear()
            if batch:
                destination.execute(table.insert(), batch)
                count += len(batch)
            copied[table.name] = count

    print("Migration complete. Rows copied:")
    for table_name, count in sorted(copied.items()):
        print(f"  {table_name}: {count}")
    print("Original SQLite database and song files were left unchanged.")


if __name__ == "__main__":
    main()
