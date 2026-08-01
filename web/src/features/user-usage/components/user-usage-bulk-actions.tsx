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
import type { Table } from '@tanstack/react-table'
import { Ban, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DataTableBulkActions } from '@/components/data-table'
import { Button } from '@/components/ui/button'

import { USER_STATS_BATCH_MAX_SIZE } from '../constants'
import type { UserStatsRow } from '../types'
import { useUserUsage } from './user-usage-provider'

interface UserUsageBulkActionsProps {
  table: Table<UserStatsRow>
}

// 选中行后浮出的批量操作栏。
// 单次最多 100 行（与后端 userStatsBatchMaxSize 对齐），超限不弹窗而是禁用按钮并提示。
export function UserUsageBulkActions({ table }: UserUsageBulkActionsProps) {
  const { t } = useTranslation()
  const { openBatchActionDialog } = useUserUsage()

  const selected = table.getFilteredSelectedRowModel().rows
  const selectedRows = selected.map((r) => r.original)
  const overLimit = selectedRows.length > USER_STATS_BATCH_MAX_SIZE

  const handleOpen = (type: 'adjust_quota' | 'disable') => {
    if (overLimit) return
    openBatchActionDialog(type, selectedRows)
  }

  return (
    <DataTableBulkActions table={table} entityName={t('user')}>
      <Button
        variant='outline'
        size='sm'
        onClick={() => handleOpen('adjust_quota')}
        disabled={overLimit}
      >
        <Wallet className='size-4' />
        {t('Adjust Quota')}
      </Button>
      <Button
        variant='outline'
        size='sm'
        onClick={() => handleOpen('disable')}
        disabled={overLimit}
      >
        <Ban className='size-4' />
        {t('Disable')}
      </Button>
      {overLimit && (
        <span className='text-destructive text-xs'>
          {t('Up to {{n}} users per batch', { n: USER_STATS_BATCH_MAX_SIZE })}
        </span>
      )}
    </DataTableBulkActions>
  )
}
