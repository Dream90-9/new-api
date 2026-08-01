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
import { z } from 'zod'

// ============================================================================
// 用户用量统计 - 数据行 Schema
// ============================================================================
//
// 后端 controller/user_stats.go 在 model.UserStatsRow 基础上叠加了
// IsAnomaly / IsWarning 两个治理标记，对应字段定义保持一致。

export const userStatsRowSchema = z.object({
  user_id: z.number(),
  username: z.string(),
  display_name: z.string(),
  status: z.number(),
  quota: z.number(),
  used_quota: z.number(),
  period_quota: z.number(),
  period_tokens: z.number(),
  period_count: z.number(),
  last_active_at: z.number(),
  is_anomaly: z.boolean().optional().default(false),
  is_warning: z.boolean().optional().default(false),
})
export type UserStatsRow = z.infer<typeof userStatsRowSchema>

export const userStatsModelBreakdownSchema = z.object({
  model_name: z.string(),
  call_count: z.number(),
  tokens: z.number(),
  quota: z.number(),
})
export type UserStatsModelBreakdown = z.infer<
  typeof userStatsModelBreakdownSchema
>

export const userStatsChannelBreakdownSchema = z.object({
  channel_id: z.number(),
  call_count: z.number(),
  tokens: z.number(),
  quota: z.number(),
})
export type UserStatsChannelBreakdown = z.infer<
  typeof userStatsChannelBreakdownSchema
>

export const userStatsDetailSchema = z.object({
  user: userStatsRowSchema,
  model_breakdown: z.array(userStatsModelBreakdownSchema),
  channel_breakdown: z.array(userStatsChannelBreakdownSchema),
})
export type UserStatsDetail = z.infer<typeof userStatsDetailSchema>

// ============================================================================
// 请求 / 响应类型
// ============================================================================

export type UserStatsSortBy =
  | 'period_quota'
  | 'period_tokens'
  | 'period_count'
  | 'quota'
  | 'used_quota'
  | 'last_active'

export type UserStatsSortOrder = 'asc' | 'desc'

export interface GetUserStatsParams {
  p?: number
  page_size?: number
  keyword?: string
  start_time?: number // unix 秒
  end_time?: number // unix 秒
  model?: string
  channel_id?: number
  sort_by?: UserStatsSortBy
  sort_order?: UserStatsSortOrder
}

export interface UserStatsListResponse {
  success: boolean
  message?: string
  data?: {
    items: UserStatsRow[]
    total: number
    page: number
    page_size: number
  }
}

export interface UserStatsDetailResponse {
  success: boolean
  message?: string
  data?: UserStatsDetail
}

export type BatchUserAction = 'adjust_quota' | 'disable' | 'enable'

export interface BatchUserActionRequest {
  user_ids: number[]
  action: BatchUserAction
  quota_delta?: number // 仅 adjust_quota 使用，正负数表示增减
}

export interface BatchUserActionResult {
  user_id: number
  success: boolean
  error?: string
}

export interface BatchUserActionResponse {
  success: boolean
  message?: string
  data?: {
    affected: number
    failed: BatchUserActionResult[]
    results?: BatchUserActionResult[]
  }
}

export interface UserStatsThresholds {
  quota_anomaly_threshold: number
  quota_warning_threshold_pct: number
}

export interface UserStatsThresholdsResponse {
  success: boolean
  message?: string
  data?: UserStatsThresholds
}
