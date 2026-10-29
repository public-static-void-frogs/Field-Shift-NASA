from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import fields, planning, resources
from app.core.config import cors_origins
from app.core.errors import ResourceConflict, ResourceNotFound
from app.repositories.demo import DemoRepository


def create_app() -> FastAPI:
    app = FastAPI(
        title="Field Shift NASA API",
        version="1.0.0",
        description="Demo farm API. Illustrative hardcoded data; changes are shared within one process and reset on restart.",
    )
    app.state.repository = DemoRepository()

    @app.exception_handler(ResourceNotFound)
    def not_found(request: Request, error: ResourceNotFound):
        return JSONResponse(status_code=404, content={"detail": str(error)})

    @app.exception_handler(ResourceConflict)
    def conflict(request: Request, error: ResourceConflict):
        return JSONResponse(status_code=409, content={"detail": str(error)})

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )
    for router in (fields.router, planning.router, resources.router):
        app.include_router(router, prefix="/api/v1")

    @app.get("/", tags=["health"])
    def root() -> dict[str, str]:
        return {"message": "Hello Frog"}

    return app


app = create_app()
