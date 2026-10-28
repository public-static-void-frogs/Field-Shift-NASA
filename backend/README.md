# Backend

Minimal FastAPI application. Requires Python 3.10 or newer.

## Run locally

From this directory:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python main.py
```

The server binds to `127.0.0.1:8000`, configured in `main.py`.

`GET http://127.0.0.1:8000/` returns HTTP 200 with:

```json
{"message": "Hello World"}
```

Interactive API documentation: <http://127.0.0.1:8000/docs>.
OpenAPI schema: <http://127.0.0.1:8000/openapi.json>.
