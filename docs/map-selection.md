# Section analysis prototype

Hand/lasso buttons switch between moving the map and drawing sections. A drawn
zone has a light green fill, keeps its outline and hides selected source points.
Its centered Add button opens the section panel and fits the zone beside it.

Analyze sends the points, closed section geometry and a georeferenced PNG of the
map imagery to `POST /maps/sections/analyze`. Capture excludes UI overlays and
uses the current satellite tiles. The payload includes pixel dimensions, WGS84
image bounds and the image's Web Mercator projection. Capture failures show a
retryable error rather than substituting an empty image.

The green zone pulses while capture and the request run, and Analyze displays a
loading spinner. The backend runs SAM2 on the actual image and point prompts, then runs the trained
TempCNN on 16 clear Sentinel-2 observations downloaded on demand per field.
The results include the observation dates, and fields with insufficient data
are reported as skipped. Classes display as Class 0–3 until the training label
mapping is supplied. See the [API contract](../../Field-Shift-NASA/backend/docs/section-analysis.md).

On completion the lasso disappears. Geographic field boundaries and crop icons
replace it. Click a boundary or crop icon to include/exclude a result. Dragging and zooming
work over crop icons too; drags do not toggle selection. The compact right-hand
panel groups results by crop type, with a checkbox and selected/total count for
each crop. Group checkboxes select or deselect all fields of that crop and show
a mixed state when individual selections differ. Excluded results remain visible but subdued, allowing reselection. The
panel's count/area follow the included results, and Analyze becomes Add fields.
Add fields has no persistence handler yet. No catalog or saved-farm changes occur.

Cancel section removes its zone/results and restores the original points.
Overlapping selections retain their own points. Pending work is aborted when the
panel is closed or canceled. All section state clears when leaving/reloading the
map. Raw selection remains bounded by the existing viewport response budget.

The preview area is an inexpensive approximation of the drawn outline. After
analysis, displayed areas are geodesic estimates of the actual mask polygons. Masks
may be clipped by the captured image. Analysis requests allow up to five minutes;
other API calls keep their normal timeout. The panel shows progress streamed by
the backend as it segments fields, processes satellite observations and classifies
crops. The backend caches models and encodes
the image once per request. Client cancellation stops backend work between model
batches; an active native operation finishes first.
