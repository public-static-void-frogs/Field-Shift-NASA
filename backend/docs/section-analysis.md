# Section analysis: SAM2 + TempCNN

`POST /api/v1/maps/sections/analyze` requires the normal session cookie. It runs
real local model inference and never saves fields or modifies the catalog.

## Model preparation

Use Python 3.12 and the backend virtualenv. The official SAM2 source is pinned in
`requirements-ml.txt`. On CPU/macOS, install without the optional CUDA extension:

```sh
.venv/bin/pip install torch==2.15.0 torchvision==0.29.2
SAM2_BUILD_CUDA=0 .venv/bin/pip install --no-build-isolation -r requirements-ml.txt
.venv/bin/python scripts/download_sam2.py
```

On CUDA installations, omit `SAM2_BUILD_CUDA=0` if the optional CUDA extension is
wanted. The runtime defaults to CUDA when available, otherwise CPU; `ML_DEVICE`
can override it. Runtime requests never download weights. SAM2 weights live in
ignored `backend/.cache/models/sam2_hiera_tiny.pt`; TempCNN uses the checked-in
`ml/field-crop-detection-model/weights/tempcnn_best.pth`. Optional
`SAM2_CHECKPOINT` and `TEMPCNN_CHECKPOINT` accept absolute paths.
Missing dependencies/weights, invalid model configuration, or a busy model return
503. Restart the backend after installing dependencies or changing model settings.

## Request and segmentation

- `points`: 1–600 `{ "id": "source-id", "coordinates": [longitude, latitude] }`
  entries, with unique IDs and finite WGS84 positions inside the image bounds.
- `region`: a closed single-ring GeoJSON Polygon in WGS84 longitude/latitude order.
- `image`: `{ "dataUrl": "data:image/png;base64,...", "width": 1024, "height": 768,
  "bounds": [west, south, east, north], "crs": "EPSG:3857" }`.

The browser captures actual satellite imagery for the selected extent, excluding
UI overlays. Image bounds are WGS84 within the Web Mercator latitude limit;
pixels follow EPSG:3857. The maximum is 2048 pixels per dimension and 8 MiB PNG
bytes (browser capture currently caps dimensions at 1536). PNG contents and
sizes are decoded and checked. Invalid requests return 422.

The trained SAM2 tiny model receives the submitted RGB image and independently
segments each positive point prompt, with `multimask_output=False`. Image encoding
runs once per request; prompts are processed in batches of four. Only the mask
component containing the prompt is retained. Actual mask contours, including
holes, are simplified in pixel space and transformed back through Web Mercator
into geographic polygons. Area is geodesic hectares. A missing/degenerate mask
produces a `skippedPoints` entry, never a replacement square. Image-edge masks
are marked `touchesImageEdge`; their extent may be clipped to the captured image.
SAM2 is a general segmenter, so these masks are not validated agricultural parcels.

Models are lazy-loaded and cached per backend process. Each process accepts one
analysis at a time rather than queuing large images behind the mutable predictor.
Inference runs outside the event loop. Client disconnection stops work between
model batches; an executing native model operation must finish first. The browser
uses a five-minute analysis timeout; other API calls keep their ten-second default.

## TempCNN: real trained model, FAKE inputs

`app/services/ml/synthetic_crop_inputs.py` explicitly hardcodes the temporary
**16-step, 3-channel** sequence. Each scalar has a 15% chance of bounded noise
(up to ±0.025). These values are illustrative normalized inputs, not measurements;
channel meanings, units, scaling and dates are not asserted. The future data
source must replace this module using the training input contract.

The original `TempCNN` implementation is loaded from `ml`, with the actual trained
checkpoint. Input shape is `(batch, 16, 3)` transposed to `(batch, 3, 16)`, float32.
Inference uses evaluation mode (dropout disabled), softmax probabilities, and
argmax outputs. Labels, probabilities and boundaries are never randomized.
Similar synthetic inputs may all predict the same class; variety is not forced.

The checkpoint has four output classes. The training `classes.json` is absent,
so the honest default labels are `Class 0` through `Class 3`. To enable crop names,
set `TEMPCNN_CLASSES_PATH` to the original ordered label list or a verified JSON
`{ "crop name": zeroBasedIndex }` mapping covering all four classes. Never invent
the mapping. Until real inputs and labels arrive, crop predictions are integration
results rather than reliable crop determinations.

## Response

The response has `mock: false`, `model: "sam2-tiny+tempcnn"`, `requestId`, `fields`,
`skippedPoints`, and `provenance`. Each field includes:

- `id`, `pointId`, geographic `center`, polygon `geometry`, `areaHa`;
- `classIndex`, `crop`, `cropConfidence`, ordered `cropProbabilities`;
- SAM2 `segmentationConfidence`, and `touchesImageEdge`.

`provenance` explicitly reports `segmentationInputs: "submitted_map_image_and_points"`,
`cropInputs: "synthetic"`, `syntheticCropInputs: true`, `sequenceShape: [16,3]`,
input-noise seed/settings, `classLabels`, `cropLabelSource`, and device. Each request
also logs a warning that TempCNN inputs are FAKE. Its seed can reproduce the inputs
with `synthetic_sequences(count, seed)`; no input series or imagery is persisted.
The frontend supports arbitrary class labels with a neutral plant icon fallback,
keeps crop grouping and deselection, and leaves Add fields without persistence.

## Actual execution evidence

On 2026-11-07, real inference ran on macOS arm64 / Python 3.12 / CPU:

- The repository sample PNG (2030×1116) with two real pixel prompts returned two
  SAM2 masks; SAM2 scores were approximately 0.427 and 0.699.
- An authenticated HTTP request through the application on an isolated temporary
  SQLite database used actual Esri World Imagery tile `15/12155/7835`, its exact
  Web Mercator geographic extent, and three visually chosen field-interior points.
  HTTP 200 returned three real polygons, no skipped points, in 3.44 seconds
  including lazy model loading. SAM2 scores were 0.902, 0.789, 0.908; areas were
  21.42, 18.12, 9.63 ha. Two masks touched the image edge.
- TempCNN predicted Class 0 for all three synthetic sequences, with softmax
  probabilities 0.546, 0.677, 0.618. These are actual model outputs.
- Focused checks cover geometry holes/components, Mercator projection, synthetic
  input shape/noise, busy-model handling and endpoint authentication.
