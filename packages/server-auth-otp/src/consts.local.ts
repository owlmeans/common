export const REDIS_VERIFY_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local record = cjson.decode(raw)
if record.emailKey == ARGV[1] and record.codeHash == ARGV[2] then
  redis.call('DEL', KEYS[1])
  return 1
end
record.failedAttempts = tonumber(record.failedAttempts or 0) + 1
if record.failedAttempts >= tonumber(ARGV[3]) then
  redis.call('DEL', KEYS[1])
  return -2
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then
  redis.call('DEL', KEYS[1])
  return 0
end
redis.call('SET', KEYS[1], cjson.encode(record), 'XX', 'PX', ttl)
return -1
`

// Separates the email from the opaque issuance id inside the signed challenge.
export const CHALLENGE_DELIMITER = '::'

export const REDIS_THROTTLE_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local retry = 0
for index = 1, #KEYS do
  local offset = (index - 1) * 2
  local limit = tonumber(ARGV[offset + 1])
  local window = tonumber(ARGV[offset + 2])
  redis.call('ZREMRANGEBYSCORE', KEYS[index], '-inf', now - window)
  local count = redis.call('ZCARD', KEYS[index])
  if count >= limit then
    local oldest = redis.call('ZRANGE', KEYS[index], 0, 0, 'WITHSCORES')
    if #oldest == 2 then
      retry = math.max(retry, math.ceil((tonumber(oldest[2]) + window - now) / 1000))
    end
  end
end
if retry > 0 then return {0, retry} end
local token = ARGV[#KEYS * 2 + 1]
for index = 1, #KEYS do
  local window = tonumber(ARGV[(index - 1) * 2 + 2])
  redis.call('ZADD', KEYS[index], now, token .. ':' .. index)
  redis.call('PEXPIRE', KEYS[index], window)
end
return {1, 0}
`
