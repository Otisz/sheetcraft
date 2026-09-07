# Games are standalone, with no cross-game abstraction

Sheetcraft is intended to support more than one Game eventually, and the obvious move would be to build a shared abstraction for characters, content and derivation up front. We are deliberately not doing that: each Game owns its own schemas, its own rules and its own screens, sharing nothing but the application shell.

An abstraction over a single example is a guess. The second Game is a fresh effort that may reuse patterns and will not reuse code, and it will be designed knowing what two real systems actually have in common. The naming convention — Game-prefixed storage and Game-scoped modules — exists to keep that future separation cheap.
