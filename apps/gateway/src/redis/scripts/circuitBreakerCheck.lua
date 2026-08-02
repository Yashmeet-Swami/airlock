-- KEYS[1] = breaker key, ARGV[1] = now (ms), ARGV[2] = cooldown (ms)
-- Returns: 0 = closed (allow), 1 = half-open probe (allow, this call is the prober), 2 = open (deny)
local state = tonumber(redis.call("HGET", KEYS[1], "state") or "0")
local now = tonumber(ARGV[1])
local cooldownMs = tonumber(ARGV[2])

if state == 0 then
    return 0
end

if state == 2 then
    local openedAt = tonumber(redis.call("HGET", KEYS[1], "openedAt") or "0")
    if (now - openedAt) >= cooldownMs then
        -- Cooldown elapsed. Redis runs this script atomically (single-threaded),
        -- so whichever concurrent caller reaches this line first becomes the
        -- sole prober; every other caller sees state already flipped to 1 below.
        redis.call("HSET", KEYS[1], "state", 1)
        return 1
    end
    return 2
end

-- state == 1 (half-open): someone else is already probing
return 2
