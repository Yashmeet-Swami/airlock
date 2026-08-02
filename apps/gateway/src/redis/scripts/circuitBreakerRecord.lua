-- KEYS[1] = breaker key
-- ARGV[1] = success (1 or 0), ARGV[2] = now (ms), ARGV[3] = window size, ARGV[4] = failure threshold pct
-- Returns the resulting state: 0 = closed, 2 = open
local state = tonumber(redis.call("HGET", KEYS[1], "state") or "0")
local success = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local windowSize = tonumber(ARGV[3])
local thresholdPct = tonumber(ARGV[4])

if state == 1 then
    -- This was the half-open probe's result.
    if success == 1 then
        redis.call("HMSET", KEYS[1], "state", 0, "failures", 0, "total", 0)
        return 0
    end
    redis.call("HMSET", KEYS[1], "state", 2, "openedAt", now, "failures", 0, "total", 0)
    return 2
end

-- Normal (closed) traffic — "reset every N" rolling window (§16.1, Phase 5 plan scope decision #2).
local failures = tonumber(redis.call("HGET", KEYS[1], "failures") or "0")
local total = tonumber(redis.call("HGET", KEYS[1], "total") or "0")

total = total + 1
if success == 0 then
    failures = failures + 1
end

if total >= windowSize then
    if (failures / total) * 100 > thresholdPct then
        redis.call("HMSET", KEYS[1], "state", 2, "openedAt", now, "failures", 0, "total", 0)
        return 2
    end
    redis.call("HMSET", KEYS[1], "state", 0, "failures", 0, "total", 0)
    return 0
end

redis.call("HMSET", KEYS[1], "failures", failures, "total", total)
return 0
