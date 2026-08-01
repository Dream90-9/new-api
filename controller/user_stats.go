package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

const (
	userStatsBatchMaxSize     = 100
	userStatsDefaultTimeRange = 30 * 24 * 3600 // 默认最近 30 天，单位秒
)

// userStatsItem 是 GetUserStatsList 返回给前端的一行。
// 在 model.UserStatsRow 基础上叠加 IsAnomaly/IsWarning 两个治理标记，
// 这两个标记根据可配置阈值在 controller 层计算，避免写进 SQL。
type userStatsItem struct {
	model.UserStatsRow
	IsAnomaly bool `json:"is_anomaly"`
	IsWarning bool `json:"is_warning"`
}

// userStatsThresholdsResponse 是 GET /api/user/stats/thresholds 的返回。
type userStatsThresholdsResponse struct {
	QuotaAnomalyThreshold    int64 `json:"quota_anomaly_threshold"`
	QuotaWarningThresholdPct int   `json:"quota_warning_threshold_pct"`
}

// userStatsBatchRequest 是 POST /api/user/stats/batch 的请求体。
type userStatsBatchRequest struct {
	UserIDs    []int `json:"user_ids"`
	Action     string `json:"action"`
	QuotaDelta int64  `json:"quota_delta"`
}

// userStatsBatchResponse 记录每个用户的处理结果，前端用于展示失败明细。
type userStatsBatchResult struct {
	UserID  int    `json:"user_id"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// userStatsBatchResponse 是批量操作的返回。
type userStatsBatchResponse struct {
	Affected int                       `json:"affected"`
	Failed   []userStatsBatchResult    `json:"failed"`
	Results  []userStatsBatchResult    `json:"results,omitempty"`
}

// GetUserStatsList 处理 GET /api/user/stats/。
// 默认时间范围是最近 30 天，可以通过 start_time / end_time（unix 秒）覆盖。
func GetUserStatsList(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	startTime, endTime := resolveUserStatsTimeRange(c)

	q := model.UserStatsQuery{
		Page:      pageInfo.Page,
		PageSize:  pageInfo.PageSize,
		Keyword:   c.Query("keyword"),
		StartTime: startTime,
		EndTime:   endTime,
		ModelName: c.Query("model"),
		SortBy:    c.Query("sort_by"),
		SortOrder: c.Query("sort_order"),
	}
	if channelID, err := strconv.Atoi(c.Query("channel_id")); err == nil && channelID > 0 {
		q.ChannelID = channelID
	}

	rows, total, err := model.GetUserStatsList(q)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	items := applyUserStatsFlags(rows)

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

// GetUserStatsDetail 处理 GET /api/user/stats/:id。
// 返回主聚合行 + 模型/渠道拆分。
func GetUserStatsDetail(c *gin.Context) {
	userID, err := strconv.Atoi(c.Param("id"))
	if err != nil || userID <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	startTime, endTime := resolveUserStatsTimeRange(c)
	detail, err := model.GetUserStatsDetail(userID, startTime, endTime)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	flagged := applyUserStatsFlags([]model.UserStatsRow{detail.User})
	if len(flagged) > 0 {
		detail.User = flagged[0].UserStatsRow
	}
	common.ApiSuccess(c, detail)
}

// BatchAction 处理 POST /api/user/stats/batch。
// 单次最多 100 个用户，超限直接拒绝（防误操作）。
func BatchAction(c *gin.Context) {
	var req userStatsBatchRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if len(req.UserIDs) == 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if len(req.UserIDs) > userStatsBatchMaxSize {
		common.ApiErrorMsg(c, "批量操作最多 "+strconv.Itoa(userStatsBatchMaxSize)+" 个用户")
		return
	}

	resp := userStatsBatchResponse{Failed: []userStatsBatchResult{}}
	for _, id := range req.UserIDs {
		if err := applyUserStatsBatchAction(id, req.Action, req.QuotaDelta); err != nil {
			resp.Failed = append(resp.Failed, userStatsBatchResult{UserID: id, Success: false, Error: err.Error()})
			continue
		}
		resp.Affected++
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    resp,
	})
}

// GetUserUsageThresholds 处理 GET /api/user/stats/thresholds。
// 前端首次加载时拿这两个阈值，避免和系统设置页重复请求通用 option 接口。
func GetUserUsageThresholds(c *gin.Context) {
	common.ApiSuccess(c, userStatsThresholdsResponse{
		QuotaAnomalyThreshold:    int64(common.QuotaAnomalyThreshold),
		QuotaWarningThresholdPct: common.QuotaWarningThresholdPct,
	})
}

// applyUserStatsBatchAction 执行单个用户的批量操作。
// 复用现有 model 层方法，保证配额变更、缓存失效等副作用一致。
func applyUserStatsBatchAction(userID int, action string, quotaDelta int64) error {
	switch action {
	case "adjust_quota":
		if quotaDelta == 0 {
			return nil
		}
		// DeltaUpdateUserQuota 内部根据正负分发给 Increase/Decrease。
		return model.DeltaUpdateUserQuota(userID, int(quotaDelta))
	case "disable":
		return model.UpdateUserStatusById(userID, common.UserStatusDisabled)
	case "enable":
		return model.UpdateUserStatusById(userID, common.UserStatusEnabled)
	default:
		return errors.New("invalid action: " + action)
	}
}

// applyUserStatsFlags 在 controller 层组装异常/预警标记。
// 异常：时间窗口内消耗超过 QuotaAnomalyThreshold。
// 预警：剩余配额占初始总配额（quota + used_quota）的比例低于 QuotaWarningThresholdPct。
// 阈值为 0 时跳过对应检查（允许管理员禁用规则）。
func applyUserStatsFlags(rows []model.UserStatsRow) []userStatsItem {
	items := make([]userStatsItem, 0, len(rows))
	for _, row := range rows {
		item := userStatsItem{UserStatsRow: row}
		if common.QuotaAnomalyThreshold > 0 && row.PeriodQuota > int64(common.QuotaAnomalyThreshold) {
			item.IsAnomaly = true
		}
		if common.QuotaWarningThresholdPct > 0 {
			total := row.Quota + row.UsedQuota
			if total > 0 {
				usedPct := int(row.UsedQuota * 100 / total)
				if usedPct >= 100-common.QuotaWarningThresholdPct {
					item.IsWarning = true
				}
			}
		}
		items = append(items, item)
	}
	return items
}

// resolveUserStatsTimeRange 解析时间范围，默认最近 30 天。
func resolveUserStatsTimeRange(c *gin.Context) (int64, int64) {
	now := common.GetTimestamp()
	startTime, err := strconv.ParseInt(c.Query("start_time"), 10, 64)
	if err != nil || startTime <= 0 {
		startTime = now - int64(userStatsDefaultTimeRange)
	}
	endTime, err := strconv.ParseInt(c.Query("end_time"), 10, 64)
	if err != nil || endTime <= 0 {
		endTime = now
	}
	return startTime, endTime
}
