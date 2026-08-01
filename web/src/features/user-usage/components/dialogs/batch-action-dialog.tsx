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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { formatQuota, parseQuotaFromDollars } from '@/lib/format'

import { batchUserAction } from '../../api'
import { useUserUsage } from '../user-usage-provider'

// 批量操作 dialog：根据 type 渲染不同表单。
// adjust_quota: 输入金额变更量（正/负数对应增/减）
// disable: 仅确认按钮
export function UserUsageBatchActionDialog() {
  const { t } = useTranslation()
  const { batchAction, closeBatchActionDialog, triggerRefresh } = useUserUsage()
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)

  if (!batchAction) return null

  const { type, rows } = batchAction
  const userIds = rows.map((r) => r.user_id)

  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'

  const amountValue = parseFloat(amount) || 0
  const quotaDelta = parseQuotaFromDollars(amountValue)

  const resetAndClose = () => {
    setAmount('')
    setLoading(false)
    closeBatchActionDialog()
  }

  const handleConfirm = async () => {
    if (type === 'adjust_quota') {
      if (!amount || quotaDelta === 0) {
        toast.error(t('Please enter a non-zero amount'))
        return
      }
    }

    setLoading(true)
    try {
      const result = await batchUserAction({
        user_ids: userIds,
        action: type,
        quota_delta: type === 'adjust_quota' ? quotaDelta : undefined,
      })
      if (result.success) {
        const affected = result.data?.affected ?? 0
        const failed = result.data?.failed ?? []
        if (failed.length === 0) {
          toast.success(
            t('Batch action completed', {
              count: userIds.length,
              affected,
            })
          )
        } else {
          toast.warning(
            t('Batch action partially failed', {
              affected,
              failed: failed.length,
            })
          )
        }
        resetAndClose()
        triggerRefresh()
      } else {
        toast.error(result.message || t('Batch action failed'))
      }
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : t('Batch action failed')
      )
    } finally {
      setLoading(false)
    }
  }

  const titleKey =
    type === 'adjust_quota'
      ? 'Batch Adjust Quota'
      : type === 'disable'
        ? 'Batch Disable Users'
        : 'Batch Enable Users'
  const descKey =
    type === 'adjust_quota'
      ? 'Apply the same quota delta to all selected users. Use a negative value to subtract.'
      : type === 'disable'
        ? 'Disable all selected users. Their tokens will stop working immediately.'
        : 'Re-enable all selected users. They will be able to log in and use tokens again.'

  return (
    <Dialog
      open={!!batchAction}
      onOpenChange={(open) => !open && resetAndClose()}
      title={t(titleKey, { count: userIds.length })}
      description={t(descKey)}
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button variant='outline' onClick={resetAndClose} disabled={loading}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || (type === 'adjust_quota' && !amount)}
            variant={type === 'disable' ? 'destructive' : 'default'}
          >
            {loading ? t('Processing...') : type === 'disable' ? t('Disable') : t('Confirm')}
          </Button>
        </>
      }
    >
      <div className='space-y-3'>
        <div className='bg-muted/50 rounded-lg p-3 text-sm'>
          <div className='text-muted-foreground'>
            {t('Selected users', { count: userIds.length })}
          </div>
          <div className='mt-1 flex flex-wrap gap-1'>
            {rows.slice(0, 8).map((r) => (
              <span
                key={r.user_id}
                className='bg-background rounded border px-1.5 py-0.5 text-xs font-medium'
              >
                {r.username}
              </span>
            ))}
            {rows.length > 8 && (
              <span className='text-muted-foreground self-center text-xs'>
                {t('+ {{n}} more', { n: rows.length - 8 })}
              </span>
            )}
          </div>
        </div>

        {type === 'adjust_quota' && (
          <div className='space-y-2'>
            <Label>
              {t('Quota Delta')} ({currencyLabel})
            </Label>
            <Input
              type='number'
              step={tokensOnly ? 1 : 0.000001}
              placeholder={t(
                'Positive to add, negative to subtract (e.g. 10 or -5)'
              )}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm()
              }}
              autoFocus
            />
            <p className='text-muted-foreground text-xs'>
              {amount && !isNaN(amountValue) && amountValue !== 0
                ? t('Each user') +
                  ': ' +
                  formatQuota(quotaDelta > 0 ? quotaDelta : -quotaDelta) +
                  (amountValue > 0 ? ' ↑' : ' ↓')
                : t('Enter a non-zero amount to preview the change per user')}
            </p>
          </div>
        )}

        {type === 'disable' && (
          <p className='text-muted-foreground text-sm'>
            {t(
              'This will disable {{count}} users. They will be logged out and their tokens will stop working immediately.',
              { count: userIds.length }
            )}
          </p>
        )}

        {type === 'enable' && (
          <p className='text-muted-foreground text-sm'>
            {t(
              'This will re-enable {{count}} users. They will be able to log in and use their tokens again.',
              { count: userIds.length }
            )}
          </p>
        )}
      </div>
    </Dialog>
  )
}
