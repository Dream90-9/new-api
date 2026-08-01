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
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, Eye, Wallet, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber, formatQuota, formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'

import { USER_STATS_STATUS } from '../constants'
import type { UserStatsRow } from '../types'

// 列定义 hook 需要的回调：只负责打开 dialog，不直接做 mutation。
// mutation 写在 dialog 内部，成功后通过 triggerRefresh 通知表格刷新。
interface UseUserUsageColumnsArgs {
  onOpenDetail: (userId: number) => void
  onOpenAdjustQuota: (row: UserStatsRow) => void
}

export function useUserUsageColumns({
  onOpenDetail,
  onOpenAdjustQuota,
}: UseUserUsageColumnsArgs): ColumnDef<UserStatsRow>[] {
  const { t } = useTranslation()

  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t('Select all')}
          className='translate-y-[2px]'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t('Select row')}
          className='translate-y-[2px]'
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      accessorKey: 'username',
      header: t('User'),
      cell: ({ row }) => {
        const { username, display_name, status, is_anomaly, is_warning } =
          row.original
        const isDisabled = status === USER_STATS_STATUS.DISABLED
        return (
          <div className='flex min-w-[200px] flex-col gap-1'>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={() => onOpenDetail(row.original.user_id)}
                className='text-left font-medium text-foreground hover:text-primary hover:underline'
              >
                {username}
              </button>
              {is_anomaly && (
                <Tooltip>
                  <TooltipTrigger render={<Badge variant='destructive' />}>
                    <AlertTriangle className='size-3' />
                    <span className='ml-1'>{t('Anomaly')}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('Consumption exceeds the anomaly threshold')}
                  </TooltipContent>
                </Tooltip>
              )}
              {is_warning && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Badge className='bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' />
                    }
                  >
                    <Zap className='size-3' />
                    <span className='ml-1'>{t('Warning')}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('Remaining quota is below the warning threshold')}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className='text-muted-foreground flex items-center gap-2 text-xs'>
              <span className='max-w-[160px] truncate'>{display_name}</span>
              {isDisabled && (
                <Badge variant='outline' className='text-muted-foreground'>
                  {t('Disabled')}
                </Badge>
              )}
            </div>
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'period_quota',
      header: t('Consumption'),
      cell: ({ row }) => {
        const quota = row.getValue('period_quota') as number
        return (
          <span className='tabular-nums font-medium'>
            {formatQuota(quota)}
          </span>
        )
      },
      size: 130,
      meta: { mobileOrder: 20 },
    },
    {
      accessorKey: 'period_count',
      header: t('Calls'),
      cell: ({ row }) => (
        <span className='text-muted-foreground tabular-nums'>
          {formatNumber(row.getValue('period_count') as number)}
        </span>
      ),
      size: 100,
      meta: { mobileOrder: 30 },
    },
    {
      accessorKey: 'period_tokens',
      header: t('Tokens'),
      cell: ({ row }) => (
        <span className='text-muted-foreground tabular-nums'>
          {formatNumber(row.getValue('period_tokens') as number)}
        </span>
      ),
      size: 120,
      meta: { mobileOrder: 40 },
    },
    {
      accessorKey: 'quota',
      header: t('Remaining Quota'),
      // 配额列同时展示「剩余 / 总配额」+ 占比条，让管理员一眼看到预警用户。
      // 复用 UserQuotaCell 的视觉风格（绿/黄/红进度条）但内联实现避免依赖耦合。
      cell: ({ row }) => {
        const { quota, used_quota } = row.original
        const total = quota + used_quota
        const usedPct = total > 0 ? (used_quota / total) * 100 : 0
        const remainingPct = 100 - usedPct

        const progressColor =
          remainingPct <= 10
            ? '[&_[data-slot=progress-indicator]]:bg-rose-500'
            : remainingPct <= 30
              ? '[&_[data-slot=progress-indicator]]:bg-amber-500'
              : '[&_[data-slot=progress-indicator]]:bg-emerald-500'

        return (
          <div className='w-[140px] space-y-1.5'>
            <div className='flex items-center justify-between text-xs tabular-nums'>
              <span className='font-medium'>{formatQuota(quota)}</span>
              <span className='text-muted-foreground'>
                {t('Total')}: {formatQuota(total)}
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger render={<div className='cursor-help' />}>
                <Progress
                  value={remainingPct}
                  className={cn('h-1.5', progressColor)}
                />
              </TooltipTrigger>
              <TooltipContent>
                <div className='space-y-1 text-xs'>
                  <div>
                    {t('Used')}: {formatQuota(used_quota)} ({usedPct.toFixed(1)}
                    %)
                  </div>
                  <div>
                    {t('Remaining')}: {formatQuota(quota)} (
                    {remainingPct.toFixed(1)}%)
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        )
      },
      size: 160,
      meta: { mobileOrder: 50 },
    },
    {
      accessorKey: 'last_active',
      header: t('Last Active'),
      cell: ({ row }) => (
        <span className='text-muted-foreground'>
          {formatTimestamp(row.getValue('last_active') as number)}
        </span>
      ),
      size: 140,
      meta: { mobileOrder: 60 },
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: ({ row }) => (
        <div className='flex items-center gap-1'>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-8'
                  onClick={() => onOpenDetail(row.original.user_id)}
                />
              }
            >
              <Eye className='size-4' />
            </TooltipTrigger>
            <TooltipContent>{t('View Details')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-8'
                  onClick={() => onOpenAdjustQuota(row.original)}
                />
              }
            >
              <Wallet className='size-4' />
            </TooltipTrigger>
            <TooltipContent>{t('Adjust Quota')}</TooltipContent>
          </Tooltip>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 100,
    },
  ]
}
