-- ============================================================================
-- 0035 — device_input screen type (Enhancement Plan §5)
-- ============================================================================
--
-- Compass heading, tilt and shakes as mission input, each with an equivalent
-- manual route on the same screen (src/components/mission/screens/device.tsx).
-- Readings are numbers graded by the runtime on the server like any library
-- input (interactions/contracts.ts); nothing else leaves the device. Camera
-- scanning is an option on code_entry, not a type, and needs no schema.
-- ============================================================================

alter type screen_type add value if not exists 'device_input';
