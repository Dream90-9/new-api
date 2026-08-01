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
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { OnChangeFn, SortingState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { getUserStats } from '../api'
import { USER_STATS_SORTABLE_COLUMNS } from '../constants'
import type { UserStatsSortBy } from '../types'
import { useUserUsageColumns } from './user-usage-columns'
import { UserUsageTimeRangeSwitch } from './user-usage-time-range-switch'
import { useUserUsage } from './user-usage-provider'
import { UserUsageBulkActions } from './user-usage-bulk-actions'

const route = getRouteApi('/_authenticated/user-usage/')

const SORTABLE_SET = new Set<string>(USER_STATS_SORTABLE_COLUMNS)

export function UserUsageTable() {
  const { t } = useTranslation()
  const {
    timeRangeDays,
    setTimeRangeDays,
    refreshTrigger,
    openDetailDialog,
    openAdjustQuotaDialog,
  } = useUserUsage()
  const isMobile = useMediaQuery('(max-width: 640px)')
  // 默认按消耗金额降序，符合「找谁在烧钱」的首要场景。
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'period_quota', desc: true },
  ])

  const {
    globalFilter,
    onGlobalFilterChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: route.useSearch(),
    navigate: route.useNavigate(),
    pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
    globalFilter: { enabled: true, key: 'filter' },
  })

  // 排序白名单外的列不允许传给后端，避免无效参数。
  const sortParams = useMemo(() => {
    const active = sorting[0]
    if (!active || !SORTABLE_SET.has(active.id)) return {}
    return {
      sort_by: active.id as UserStatsSortBy,
      sort_order: active.desc ? ('desc' as const) : ('asc' as const),
    }
  }, [sorting])

  // 时间范围换算成 unix 秒；endTime 用当下保证包含最新数据。
  const { startTime, endTime } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)
    return {
      startTime: now - timeRangeDays * 86400,
      endTime: now,
    }
  }, [timeRangeDays])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'user-stats',
      pagination.pageIndex + 1,
      pagination.pageSize,
      globalFilter,
      sortParams,
      startTime,
      endTime,
      refreshTrigger,
    ],
    queryFn: async () => {
      const result = await getUserStats({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        keyword: globalFilter,
        start_time: startTime,
        end_time: endTime,
        ...sortParams,
      })
      if (!result.success) {
        toast.error(result.message || t('Failed to load user usage data'))
        return { items: [], total: 0 }
      }
      return {
        items: result.data?.items ?? [],
        total: result.data?.total ?? 0,
      }
    },
    placeholderData: (previousData) => previousData,
  })

  const rows = data?.items ?? []
  const columns = useUserUsageColumns({
    onOpenDetail: openDetailDialog,
    onOpenAdjustQuota: openAdjustQuotaDialog,
  })

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting(updater)
    // 切换排序时回到第一页，避免在第 3 页排「次数最少」却看到旧的 Top N。
    if (pagination.pageIndex > 0) {
      onPaginationChange({ ...pagination, pageIndex: 0 })
    }
  }

  const { table } = useDataTable({
    data: rows,
    columns,
    enableRowSelection: true,
    globalFilter,
    pagination,
    sorting,
    onGlobalFilterChange,
    onPaginationChange,
    onSortingChange: handleSortingChange,
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    totalCount: data?.total ?? 0,
    ensurePageInRange,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No User Usage Found')}
      emptyDescription={t(
        'No usage data in the selected time range. Try widening the range or clearing the filter.'
      )}
      skeletonKeyPrefix='user-usage-skeleton'
      applyHeaderSize
      toolbarProps={{
        searchPlaceholder: t('Filter by username or user ID...'),
        additionalSearch: (
          <UserUsageTimeRangeSwitch
            value={timeRangeDays}
            onChange={setTimeRangeDays}
          />
        ),
      }}
      bulkActions={<UserUsageBulkActions table={table} />}
    />
  )
}
