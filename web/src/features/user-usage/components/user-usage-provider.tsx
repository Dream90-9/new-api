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
import { createContext, useContext, useMemo, useState } from 'react'

import { USER_STATS_DEFAULT_TIME_RANGE_DAYS } from '../constants'
import type { UserStatsRow } from '../types'

// 批量操作类型与后端 BatchUserAction 对齐，dialog 按当前 type 渲染不同表单。
// 单行操作（详情除外）复用 batchAction 状态，rows 长度为 1 即可，避免维护两套 dialog。
type BatchActionType = 'adjust_quota' | 'disable' | 'enable'

interface UserUsageContextValue {
  // 时间范围（天）：影响 useQuery 的 start_time/end_time 计算。
  timeRangeDays: number
  setTimeRangeDays: (days: number) => void

  // 刷新触发器：批量操作 / 调整配额成功后自增，触发列表 refetch。
  refreshTrigger: number
  triggerRefresh: () => void

  // 详情 dialog：传 userId，由 dialog 内部拉 detail 数据。
  detailUserId: number | null
  openDetailDialog: (userId: number) => void
  closeDetailDialog: () => void

  // 单行调整配额：内部复用 batchAction（rows=[当前行]），UI 在 dialog 内根据
  // rows.length 区分单行/批量展示。
  openAdjustQuotaDialog: (row: UserStatsRow) => void

  // 批量操作 dialog：保存选中的行 + 当前操作类型。
  batchAction: { type: BatchActionType; rows: UserStatsRow[] } | null
  openBatchActionDialog: (type: BatchActionType, rows: UserStatsRow[]) => void
  closeBatchActionDialog: () => void
}

const UserUsageContext = createContext<UserUsageContextValue | null>(null)

export function UserUsageProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [timeRangeDays, setTimeRangeDays] = useState(
    USER_STATS_DEFAULT_TIME_RANGE_DAYS
  )
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [detailUserId, setDetailUserId] = useState<number | null>(null)
  const [batchAction, setBatchAction] = useState<{
    type: BatchActionType
    rows: UserStatsRow[]
  } | null>(null)

  const value = useMemo<UserUsageContextValue>(
    () => ({
      timeRangeDays,
      setTimeRangeDays,
      refreshTrigger,
      triggerRefresh: () => setRefreshTrigger((n) => n + 1),
      detailUserId,
      openDetailDialog: (userId: number) => setDetailUserId(userId),
      closeDetailDialog: () => setDetailUserId(null),
      openAdjustQuotaDialog: (row: UserStatsRow) =>
        setBatchAction({ type: 'adjust_quota', rows: [row] }),
      batchAction,
      openBatchActionDialog: (type: BatchActionType, rows: UserStatsRow[]) =>
        setBatchAction({ type, rows }),
      closeBatchActionDialog: () => setBatchAction(null),
    }),
    [timeRangeDays, refreshTrigger, detailUserId, batchAction]
  )

  return (
    <UserUsageContext.Provider value={value}>
      {children}
    </UserUsageContext.Provider>
  )
}

export function useUserUsage() {
  const ctx = useContext(UserUsageContext)
  if (!ctx) {
    throw new Error('useUserUsage must be used within UserUsageProvider')
  }
  return ctx
}
