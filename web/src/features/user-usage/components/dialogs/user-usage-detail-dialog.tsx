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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber, formatQuota, formatTimestamp } from '@/lib/format'

import { getUserStatsDetail } from '../../api'
import { USER_STATS_STATUS } from '../../constants'
import { useUserUsage } from '../user-usage-provider'

// 详情 dialog：展示单用户的聚合数据 + 模型/渠道拆分。
// 模型/渠道拆分用最简单的 Table 列表，不引入 DataTable 体系（数据量小、列固定）。
export function UserUsageDetailDialog() {
  const { t } = useTranslation()
  const {
    detailUserId,
    closeDetailDialog,
    timeRangeDays,
    openAdjustQuotaDialog,
    openBatchActionDialog,
  } = useUserUsage()

  const { startTime, endTime } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000)
    return {
      startTime: now - timeRangeDays * 86400,
      endTime: now,
    }
  }, [timeRangeDays])

  const open = detailUserId !== null
  const { data, isLoading } = useQuery({
    queryKey: ['user-stats-detail', detailUserId, startTime, endTime],
    queryFn: async () => {
      const res = await getUserStatsDetail(detailUserId!, {
        start_time: startTime,
        end_time: endTime,
      })
      if (!res.success) {
        toast.error(res.message || t('Failed to load user detail'))
        return null
      }
      return res.data ?? null
    },
    enabled: open && detailUserId !== null,
  })

  const user = data?.user
  const isDisabled = user?.status === USER_STATS_STATUS.DISABLED

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && closeDetailDialog()}
      title={user ? `${user.username} · ${t('Usage Detail')}` : t('Usage Detail')}
      description={t(
        'Aggregated usage in the last {{n}} days, broken down by model and channel.',
        { n: timeRangeDays }
      )}
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        user ? (
          <>
            <Button
              variant='outline'
              onClick={() => {
                closeDetailDialog()
                openAdjustQuotaDialog(user)
              }}
            >
              {t('Adjust Quota')}
            </Button>
            <Button
              variant={isDisabled ? 'default' : 'destructive'}
              onClick={() => {
                closeDetailDialog()
                openBatchActionDialog(
                  isDisabled ? 'enable' : 'disable',
                  [user]
                )
              }}
            >
              {isDisabled ? t('Enable User') : t('Disable User')}
            </Button>
          </>
        ) : null
      }
    >
      {!data || isLoading ? (
        <div className='text-muted-foreground py-8 text-center text-sm'>
          {t('Loading...')}
        </div>
      ) : (
        <>
          {user && (
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
              <StatBlock
                label={t('Consumption')}
                value={formatQuota(user.period_quota)}
              />
              <StatBlock
                label={t('Calls')}
                value={formatNumber(user.period_count)}
              />
              <StatBlock
                label={t('Tokens')}
                value={formatNumber(user.period_tokens)}
              />
              <StatBlock
                label={t('Last Active')}
                value={formatTimestamp(user.last_active_at)}
              />
            </div>
          )}

          <BreakdownSection
            title={t('By Model')}
            rows={data.model_breakdown.map((m) => ({
              key: m.model_name,
              cells: [
                formatNumber(m.call_count),
                formatNumber(m.tokens),
                formatQuota(m.quota),
              ],
            }))}
            headers={[t('Model'), t('Calls'), t('Tokens'), t('Quota')]}
          />

          <BreakdownSection
            title={t('By Channel')}
            rows={data.channel_breakdown.map((c) => ({
              key: String(c.channel_id),
              cells: [
                formatNumber(c.call_count),
                formatNumber(c.tokens),
                formatQuota(c.quota),
              ],
            }))}
            headers={[t('Channel ID'), t('Calls'), t('Tokens'), t('Quota')]}
          />
        </>
      )}
    </Dialog>
  )
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className='bg-muted/40 rounded-lg p-3'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className='mt-1 truncate text-sm font-medium tabular-nums'>
        {value}
      </div>
    </div>
  )
}

function BreakdownSection({
  title,
  headers,
  rows,
}: {
  title: string
  headers: string[]
  rows: { key: string; cells: string[] }[]
}) {
  const { t } = useTranslation()
  return (
    <div className='space-y-2'>
      <div className='text-sm font-medium'>{title}</div>
      <div className='border-border overflow-hidden rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={headers.length}
                  className='text-muted-foreground py-4 text-center text-sm'
                >
                  {t('No data')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className='font-medium'>{r.key}</TableCell>
                  {r.cells.map((c, i) => (
                    <TableCell
                      key={i}
                      className='text-muted-foreground tabular-nums'
                    >
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
