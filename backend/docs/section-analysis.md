# Mock section analysis contract

`POST /api/v1/maps/sections/analyze` requires the normal session cookie. It is a
local development stand-in, not image inference. It does not read or modify the
field catalog or save selected fields.

The JSON request contains:

- `points`: up to 600 entries, each `{ "id": "source-point-id", "coordinates": [longitude, latitude] }`.
  IDs must be unique; coordinates must be finite WGS84 positions inside the image bounds.
- `region`: a GeoJSON Polygon containing one closed ring, in WGS84 longitude/latitude order.
- `image`: `{ "dataUrl": "data:image/png;base64,...", "width": 1024, "height": 768,
  "bounds": [west, south, east, north], "crs": "EPSG:3857" }`.

The image is the satellite imagery visible in the selected zone, cropped to its
extent without UI overlays, region tint or field annotations. It is composited
from the map's CORS-enabled imagery tiles. Image bounds are expressed in WGS84;
pixels follow the Web Mercator projection specified by `crs`. Width and height
match the PNG header, with a maximum of 2048 pixels per dimension and 8 MiB of
decoded image data. The browser currently caps capture at 1536 pixels. Invalid
encoding, dimensions, coordinates or geometry return 422.

After a 2.5-second asynchronous delay, the mock returns:

```json
{
  "requestId": "e9df51cc-0549-440e-83dc-10c58dce4aab",
  "mock": true,
  "model": "mock-field-detector-v1",
  "fields": [
    {
      "id": "116415b9-f51c-47e3-b4d7-d3c9546b3256",
      "pointId": "source-point-id",
      "crop": "Corn",
      "center": [-93.87, 42.05],
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-93.871,42.049],[-93.869,42.049],[-93.869,42.051],[-93.871,42.051],[-93.871,42.049]]]
      },
      "areaHa": 1.2
    }
  ]
}
```

One field is generated per input point. Crop labels are randomly chosen from
Winter wheat, Corn and Soybeans. Boundaries are randomly sized square estimates,
slightly offset around the point, expressed as closed geographic polygons. The
image is accepted and validated but deliberately not interpreted. An empty point
list returns no fields. The mock stores neither request imagery nor results.

The frontend pulses the selected zone and shows button loading for the capture
and request lifecycle. On success the lasso is replaced by geographic field
boundaries and clickable crop icons. Users can deselect results through the map
or panel checkboxes. The panel then shows Add fields, which has no persistence
handler at this stage. Cancellation aborts the client request and discards local
results; switching away from a pending section cancels its pending state.

Replace `app/services/section_analysis.py` with the real model behind this HTTP
contract. `mock` and `model` explicitly identify current result provenance.
No live or automated verification was run for this endpoint at the user's request.
