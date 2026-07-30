package service

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
)

// 单通道（per-channel）风控保护：
//   - 并发上限：用 ZSET + Lua 脚本维护活跃请求集合，score 为开始时间戳，
//     每次获取前先清理过期成员，再判断 ZCARD 是否达上限。
//   - RPM 上限：用分钟桶 INCR + EXPIRE 60s 实现固定窗口。
// 任何一项触发都返回 channel:* 错误，让 controller/relay.go 切换到其他通道重试。

const (
	channelConcurrentKeyFmt = "newapi:channel:concurrent:%d"
	channelRpmKeyFmt        = "newapi:channel:rpm:%d:%d"
	// 单个请求在 ZSET 中的最大生存时间（秒），防止进程崩溃导致计数泄漏。
	channelSlotTTLSeconds = 600
)

var channelAcquireScript = redis.NewScript(`
local now = tonumber(ARGV[1])
local requestId = ARGV[2]
local limit = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local key = KEYS[1]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - ttl)
if redis.call('ZCARD', key) >= limit then
  return 0
end
redis.call('ZADD', key, now, requestId)
redis.call('EXPIRE', key, ttl)
return 1
`)

// TryAcquireChannelSlot 尝试为指定通道占用一个并发槽位，并校验 RPM 上限。
// 返回 release 函数（成功时必须 defer 调用）和错误（超限时为 channel:* 错误）。
// 当配置上限为 0、channelId 非法、或 Redis 未启用时直接放行，不做任何检查。
func TryAcquireChannelSlot(channelId int) (func(), *types.NewAPIError) {
	noopRelease := func() {}
	if channelId <= 0 || !common.RedisEnabled {
		return noopRelease, nil
	}

	// Per-channel limit overrides the global default; 0 means unlimited for this channel.
	maxConcurrent := common.ChannelMaxConcurrent
	if limit, ok := common.ChannelConcurrentLimits[channelId]; ok {
		maxConcurrent = limit
	}

	if maxConcurrent == 0 && common.ChannelMaxRPM == 0 {
		return noopRelease, nil
	}

	requestId := uuid.New().String()
	now := time.Now().Unix()
	ctx := context.Background()

	if maxConcurrent > 0 {
		key := fmt.Sprintf(channelConcurrentKeyFmt, channelId)
		result, runErr := channelAcquireScript.Run(ctx, common.RDB, []string{key},
			now, requestId, maxConcurrent, channelSlotTTLSeconds).Int()
		if runErr != nil {
			// Redis 异常不阻塞业务：放行但不占用槽位（release 也无需做事）。
			common.SysError(fmt.Sprintf("channel concurrent acquire failed: %v", runErr))
		} else if result == 0 {
			return noopRelease, types.NewError(
				fmt.Errorf("channel %d concurrent limit reached (%d in flight)",
					channelId, maxConcurrent),
				types.ErrorCodeChannelConcurrentLimited,
				types.ErrOptionWithStatusCode(http.StatusTooManyRequests),
			)
		}
	}

	if common.ChannelMaxRPM > 0 {
		key := fmt.Sprintf(channelRpmKeyFmt, channelId, now/60)
		result, runErr := common.RDB.Incr(ctx, key).Result()
		if runErr != nil {
			common.SysError(fmt.Sprintf("channel rpm acquire failed: %v", runErr))
		} else {
			if result == 1 {
				_ = common.RDB.Expire(ctx, key, 90*time.Second).Err()
			}
			if result > int64(common.ChannelMaxRPM) {
				// 已被 RPM 拦截，回滚并发槽位避免泄漏。
				if maxConcurrent > 0 {
					concurrentKey := fmt.Sprintf(channelConcurrentKeyFmt, channelId)
					_ = common.RDB.ZRem(ctx, concurrentKey, requestId).Err()
				}
				return noopRelease, types.NewError(
					fmt.Errorf("channel %d rpm limit reached (%d/min)",
						channelId, common.ChannelMaxRPM),
					types.ErrorCodeChannelRpmLimited,
					types.ErrOptionWithStatusCode(http.StatusTooManyRequests),
				)
			}
		}
	}

	release := func() {
		if maxConcurrent > 0 {
			key := fmt.Sprintf(channelConcurrentKeyFmt, channelId)
			_ = common.RDB.ZRem(ctx, key, requestId).Err()
		}
	}
	return release, nil
}
