from pathlib import Path
from urllib.parse import unquote, urlparse
import os

from sqlalchemy import create_engine, text
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "backend" / ".env")
DATABASE_URL = os.getenv("DATABASE_URL")


def _build_engine():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is missing")
    db_url = DATABASE_URL
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(db_url, pool_pre_ping=True)


def _extract_local_path(photo_url: str | None, upload_dir: Path) -> Path | None:
    if not photo_url:
        return None

    parsed = urlparse(photo_url)
    raw_path = unquote(parsed.path or "")
    marker = "/uploads/maintenance/"
    if marker not in raw_path:
        return None

    filename = raw_path.split(marker, 1)[1].strip()
    if not filename:
        return None

    candidate = (upload_dir / Path(filename).name).resolve()
    try:
        candidate.relative_to(upload_dir)
    except ValueError:
        return None
    return candidate


def main() -> None:
    upload_dir = (ROOT / "backend" / "uploads" / "maintenance").resolve()
    engine = _build_engine()

    deleted_files: set[str] = set()
    cleaned_reports = 0

    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT mr.id, mr.status::text AS report_status, t.status::text AS task_status,
                       mr.before_photo_url, mr.after_photo_url
                FROM maintenance_reports mr
                LEFT JOIN tasks t ON t.id = mr.task_id
                WHERE mr.before_photo_url IS NOT NULL OR mr.after_photo_url IS NOT NULL
                ORDER BY mr.id DESC
                """
            )
        ).fetchall()

        for row in rows:
            should_cleanup = (
                row.report_status in ("completed", "verified")
                or row.task_status == "closed"
            )
            if not should_cleanup:
                continue

            for photo_url in (row.before_photo_url, row.after_photo_url):
                path = _extract_local_path(photo_url, upload_dir)
                if path and path.exists() and path.is_file():
                    path.unlink()
                    deleted_files.add(path.name)

            cleaned_reports += 1

    remaining = sorted(p.name for p in upload_dir.glob("*") if p.is_file())
    print(f"cleaned_reports={cleaned_reports}")
    print(f"deleted_files={sorted(deleted_files)}")
    print(f"remaining_files={remaining}")


if __name__ == "__main__":
    main()
