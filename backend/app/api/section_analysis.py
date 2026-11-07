import asyncio

from fastapi import APIRouter

from app.schemas.section_analysis import SectionAnalysisRequest, SectionAnalysisResponse
from app.services.section_analysis import mock_analysis

router = APIRouter(tags=["section analysis"])


@router.post(
    "/maps/sections/analyze",
    response_model=SectionAnalysisResponse,
    description="Development mock: accepts selected WGS84 points, a closed section polygon and the map PNG with its geographic extent. Waits briefly, then returns random crop labels and square field polygons near the input points. Does not interpret imagery or save any data. Replace the model implementation while preserving this contract.",
    responses={
        422: {"description": "Invalid points, region, PNG encoding, dimensions or image extent"}
    },
)
async def analyze_section(payload: SectionAnalysisRequest):
    await asyncio.sleep(2.5)
    return mock_analysis(payload)
