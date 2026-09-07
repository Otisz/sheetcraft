# Keep a server, despite there being no server-side data

The app has no API, no authentication and no server-side data — every Game route reads local storage, and the landing and games pages are prerendered at build. It could therefore deploy as pure static files with no running process, and we are keeping a server anyway.

The landing and games pages remain prerendered and the Game routes disable server rendering, so nothing about the rendering strategy depends on this; it is a deployment choice, and it preserves the option of adding server-side behaviour without restructuring.

## Status

The trade-off recorded here is the technical one. The originating rationale for preferring a running server to a static deployment was the project owner's and is not captured — worth filling in if this is ever revisited.
