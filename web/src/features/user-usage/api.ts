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
import { api } from '@/lib/api'

import type {
  BatchUserActionRequest,
  BatchUserActionResponse,
  GetUserStatsParams,
  UserStatsDetailResponse,
  UserStatsListResponse,
  UserStatsThresholdsResponse,
} from './types'

// 路由前缀对应后端 router/api-router.go 的 adminRoute /stats/ 组。
const BASE = '/api/user/stats'

/**
 * 获取用户用量统计列表（分页 + 筛选 + 排序）。
 * 后端默认时间范围最近 30 天，前端不传 start_time/end_time 即走默认。
 */
export async function getUserStats(
  params: GetUserStatsParams = {}
): Promise<UserStatsListResponse> {
  const res = await api.get(`${BASE}/`, { params })
  return res.data
}

/**
 * 获取单个用户的用量详情（含模型/渠道拆分）。
 */
export async function getUserStatsDetail(
  userId: number,
  params: Pick<GetUserStatsParams, 'start_time' | 'end_time'> = {}
): Promise<UserStatsDetailResponse> {
  const res = await api.get(`${BASE}/${userId}`, { params })
  return res.data
}

/**
 * 批量操作用户（调整配额 / 禁用 / 启用）。
 * 单次最多 100 个用户，超出由后端拒绝。
 */
export async function batchUserAction(
  body: BatchUserActionRequest
): Promise<BatchUserActionResponse> {
  const res = await api.post(`${BASE}/batch`, body)
  return res.data
}

/**
 * 获取用户用量的治理阈值配置（首次加载用，避免重复请求通用 option 接口）。
 */
export async function getUserStatsThresholds(): Promise<UserStatsThresholdsResponse> {
  const res = await api.get(`${BASE}/thresholds`)
  return res.data
}
