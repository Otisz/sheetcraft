# Equipped is a plain flag, and armor class takes the best of what is worn

Owned items carry a boolean Equipped flag with no slot model and nothing preventing two suits of armor being worn at once. Armor class derivation takes the highest-base armor among Equipped items, plus one shield.

Explicit armor and shield slots would make intent unambiguous, at the cost of a slot-management interface on a phone and a class of invalid states to police. The tolerant flag has no invalid states, and the heuristic is allowed to be a heuristic because the Override from ADR-0012 sits behind it.
