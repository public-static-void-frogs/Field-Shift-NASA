import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.database import Base
from app.main import create_app

TEST_ISSUER = "test-fieldshift-nasa"
TEST_SECRET = "test-only-signing-key-which-is-more-than-32-bytes"


def isolated_app():
    directory = tempfile.TemporaryDirectory()
    config = Settings(
        database_url=f"sqlite:///{Path(directory.name) / 'test.db'}",
        jwt_secret=TEST_SECRET,
        jwt_issuer=TEST_ISSUER,
    )
    app = create_app(config)
    Base.metadata.create_all(app.state.engine)
    return directory, app


def register(client: TestClient, email="farmer@example.com", **values):
    return client.post(
        "/api/v1/auth/register",
        json={
            "fullName": "Test Farmer",
            "email": email,
            "password": "Test-password-123",
            "farmName": "Test Farm",
            "location": "Kyiv",
            **values,
        },
    )
