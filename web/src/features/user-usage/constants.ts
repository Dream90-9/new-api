/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
// 用户状态值与后端 common/constants.go 保持一致（1=enabled, 2=disabled）。
export const USER_STATS_STATUS = {
  ENABLED: 1,
  DISABLED: 2,
} as const

// 时间范围预设（天）。与后端默认 30 天对齐，避免初次进入页面时拉取全量数据。
export const USER_STATS_TIME_RANGE_DAYS = [7, 30, 90] as const
export const USER_STATS_DEFAULT_TIME_RANGE_DAYS = 30

// 单次批量操作最多用户数（与后端 userStatsBatchMaxSize 对齐）。
export const USER_STATS_BATCH_MAX_SIZE = 100

// 可排序字段白名单，与 model/user_stats.go 的 userStatsSortWhitelist 对齐。
export const USER_STATS_SORTABLE_COLUMNS = [
  'period_quota',
  'period_tokens',
  'period_count',
  'quota',
  'used_quota',
  'last_active',
] as const
