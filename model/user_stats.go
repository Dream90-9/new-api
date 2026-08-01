package model

import (
	"errors"
	"strconv"
)

// UserStatsRow 是「用户用量管理」列表里的单行聚合数据。
// 时间窗口内的指标加 Period 前缀，与 users 表上的全量字段（Quota/UsedQuota/Status）区分。
type UserStatsRow struct {
	UserID       int    `json:"user_id" gorm:"column:user_id"`
	Username     string `json:"username" gorm:"column:username"`
	DisplayName  string `json:"display_name" gorm:"column:display_name"`
	Status       int    `json:"status" gorm:"column:status"`
	Quota        int64  `json:"quota" gorm:"column:quota"`
	UsedQuota    int64  `json:"used_quota" gorm:"column:used_quota"`
	PeriodQuota  int64  `json:"period_quota" gorm:"column:period_quota"`
	PeriodTokens int64  `json:"period_tokens" gorm:"column:period_tokens"`
	PeriodCount  int64  `json:"period_count" gorm:"column:period_count"`
	LastActiveAt int64  `json:"last_active_at" gorm:"column:last_active"`
}

// UserStatsQuery 封装 GetUserStatsList 的所有筛选/分页参数。
type UserStatsQuery struct {
	Page      int
	PageSize  int
	Keyword   string
	StartTime int64
	EndTime   int64
	ModelName string
	ChannelID int
	SortBy    string
	SortOrder string
}

// UserStatsModelBreakdown 是详情页里按模型维度的聚合。
type UserStatsModelBreakdown struct {
	ModelName string `json:"model_name" gorm:"column:model_name"`
	CallCount int64  `json:"call_count" gorm:"column:call_count"`
	Tokens    int64  `json:"tokens" gorm:"column:tokens"`
	Quota     int64  `json:"quota" gorm:"column:quota"`
}

// UserStatsChannelBreakdown 是详情页里按渠道维度的聚合。
type UserStatsChannelBreakdown struct {
	ChannelID int    `json:"channel_id" gorm:"column:channel_id"`
	CallCount int64  `json:"call_count" gorm:"column:call_count"`
	Tokens    int64  `json:"tokens" gorm:"column:tokens"`
	Quota     int64  `json:"quota" gorm:"column:quota"`
}

// UserStatsDetail 是详情 endpoint 的返回结构。
type UserStatsDetail struct {
	User             UserStatsRow                `json:"user"`
	ModelBreakdown   []UserStatsModelBreakdown   `json:"model_breakdown"`
	ChannelBreakdown []UserStatsChannelBreakdown `json:"channel_breakdown"`
}

// userStatsSortWhitelist 防止 SQL 注入：只允许白名单字段排序。
var userStatsSortWhitelist = map[string]string{
	"period_quota":  "period_quota",
	"period_tokens": "period_tokens",
	"period_count":  "period_count",
	"quota":         "quota",
	"used_quota":    "used_quota",
	"last_active":   "last_active",
}

// resolveUserStatsSort 把外部传入的 SortBy/SortOrder 转成安全的 ORDER BY 片段。
// 默认按 period_quota desc。
func resolveUserStatsSort(sortBy, sortOrder string) string {
	column, ok := userStatsSortWhitelist[sortBy]
	if !ok {
		column = "period_quota"
	}
	if sortOrder != "asc" {
		sortOrder = "desc"
	}
	return column + " " + sortOrder
}

// GetUserStatsList 从 quota_data 表按时间窗口聚合每个用户的用量，
// 并 LEFT JOIN users 表带上当前剩余配额、状态等账户级字段。
// 用户无论在时间窗口内是否有调用都会出现一行（聚合字段为 0），
// 这样管理员能看到「沉默用户」。当 ModelName/ChannelID 筛选存在时，
// 强制只保留 period_count > 0 的用户（即有调用的），筛选才有意义。
func GetUserStatsList(q UserStatsQuery) ([]UserStatsRow, int64, error) {
	if q.StartTime <= 0 || q.EndTime <= 0 {
		return nil, 0, errors.New("start_time and end_time are required")
	}
	if q.EndTime < q.StartTime {
		return nil, 0, errors.New("end_time must be >= start_time")
	}

	subQuery := DB.Table("quota_data").
		Select("user_id, SUM(quota) AS period_quota, SUM(token_used) AS period_tokens, "+
			"SUM(count) AS period_count, MAX(created_at) AS last_active").
		Where("created_at >= ? AND created_at <= ?", q.StartTime, q.EndTime).
		Group("user_id")

	if q.ModelName != "" {
		subQuery = subQuery.Where("model_name = ?", q.ModelName)
	}
	if q.ChannelID > 0 {
		subQuery = subQuery.Where("channel_id = ?", q.ChannelID)
	}

	query := DB.Table("users AS u").
		Select("u.id AS user_id, u.username AS username, u.display_name AS display_name, "+
			"u.status AS status, u.quota AS quota, u.used_quota AS used_quota, "+
			"COALESCE(q.period_quota, 0) AS period_quota, "+
			"COALESCE(q.period_tokens, 0) AS period_tokens, "+
			"COALESCE(q.period_count, 0) AS period_count, "+
			"COALESCE(q.last_active, 0) AS last_active").
		Joins("LEFT JOIN (?) AS q ON q.user_id = u.id", subQuery)

	if q.ModelName != "" || q.ChannelID > 0 {
		query = query.Where("q.period_count > 0")
	}

	if q.Keyword != "" {
		if userID, err := strconv.Atoi(q.Keyword); err == nil && userID > 0 {
			query = query.Where("u.id = ? OR u.username LIKE ?", userID, "%"+q.Keyword+"%")
		} else {
			query = query.Where("u.username LIKE ?", "%"+q.Keyword+"%")
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	query = query.Order(resolveUserStatsSort(q.SortBy, q.SortOrder))

	if q.Page > 0 && q.PageSize > 0 {
		offset := (q.Page - 1) * q.PageSize
		query = query.Offset(offset).Limit(q.PageSize)
	}

	var rows []UserStatsRow
	if err := query.Scan(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// UpdateUserStatusById 修改用户状态（启用/禁用）。
// 复用 user.Update 触发 updateUserCache，确保后续请求读到新状态，
// 这与 ManageUser 走的是同一条副作用路径，批量禁用后 token 校验会立即拒绝。
func UpdateUserStatusById(userID int, status int) error {
	var user User
	if err := DB.First(&user, userID).Error; err != nil {
		return err
	}
	user.Status = status
	return user.Update(false)
}

// GetUserStatsDetail 返回单个用户的聚合信息 + 按模型/渠道拆分。
// 复用 GetUserStatsList 拿到主信息，避免 JOIN 逻辑重复。
func GetUserStatsDetail(userID int, startTime, endTime int64) (*UserStatsDetail, error) {
	if userID <= 0 {
		return nil, errors.New("invalid user id")
	}
	if startTime <= 0 || endTime <= 0 {
		return nil, errors.New("start_time and end_time are required")
	}

	rows, _, err := GetUserStatsList(UserStatsQuery{
		Page:      1,
		PageSize:  1,
		Keyword:   strconv.Itoa(userID),
		StartTime: startTime,
		EndTime:   endTime,
	})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 || rows[0].UserID != userID {
		return nil, errors.New("user not found")
	}

	detail := &UserStatsDetail{User: rows[0]}

	if err := DB.Table("quota_data").
		Select("model_name, SUM(count) AS call_count, SUM(token_used) AS tokens, SUM(quota) AS quota").
		Where("user_id = ? AND created_at >= ? AND created_at <= ?", userID, startTime, endTime).
		Group("model_name").
		Order("quota DESC").
		Scan(&detail.ModelBreakdown).Error; err != nil {
		return nil, err
	}

	if err := DB.Table("quota_data").
		Select("channel_id, SUM(count) AS call_count, SUM(token_used) AS tokens, SUM(quota) AS quota").
		Where("user_id = ? AND created_at >= ? AND created_at <= ?", userID, startTime, endTime).
		Group("channel_id").
		Order("quota DESC").
		Scan(&detail.ChannelBreakdown).Error; err != nil {
		return nil, err
	}

	return detail, nil
}
