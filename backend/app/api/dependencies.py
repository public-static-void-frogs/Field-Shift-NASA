from typing import Annotated
from uuid import UUID

from fastapi import Depends, Path, Request

from app.repositories.demo import DemoRepository


def repository(request: Request) -> DemoRepository:
    return request.app.state.repository


Store = Annotated[DemoRepository, Depends(repository)]
FieldId = UUID
ParcelId = Annotated[int, Path(gt=0)]
