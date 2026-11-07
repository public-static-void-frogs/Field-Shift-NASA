import asyncio
from threading import Event

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.schemas.section_analysis import SectionAnalysisRequest, SectionAnalysisResponse
from app.services.section_analysis import AnalysisCancelled, AnalysisUnavailable

router = APIRouter(tags=["section analysis"])


@router.post(
    "/maps/sections/analyze",
    response_model=SectionAnalysisResponse,
    description="Runs SAM2 on the submitted map PNG and positive point prompts. Runs trained TempCNN on explicitly synthetic 16-step, 3-channel inputs pending the real time-series source. No random output polygons or crop labels. Unmapped classes retain their numeric IDs. Does not save fields.",
    responses={
        422: {"description": "Invalid map image or points"},
        503: {"description": "Model unavailable or busy"},
    },
)
async def analyze_section(payload: SectionAnalysisRequest, request: Request):
    cancelled = Event()
    work = asyncio.create_task(
        run_in_threadpool(request.app.state.section_analyzer.analyze, payload, cancelled)
    )
    try:
        while not work.done():
            done, _ = await asyncio.wait({work}, timeout=0.5)
            if not done and await request.is_disconnected():
                cancelled.set()
        return await work
    except asyncio.CancelledError:
        cancelled.set()
        # A native model operation cannot be interrupted; consume the eventual result.
        work.add_done_callback(lambda task: task.exception() if not task.cancelled() else None)
        raise
    except AnalysisCancelled as error:
        raise HTTPException(status_code=499, detail="Analysis canceled") from error
    except AnalysisUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
