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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

import {
  SettingsForm,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'

// 字段值统一存为字符串（与后端 OptionMap 一致），保存时再原样回写。
const numericString = z.string().refine((value) => {
  const trimmed = value.trim()
  if (!trimmed) return true
  return !Number.isNaN(Number(trimmed)) && Number(trimmed) >= 0
}, 'Enter a non-negative number or leave empty')

const percentString = z.string().refine((value) => {
  const trimmed = value.trim()
  if (!trimmed) return true
  const n = Number(trimmed)
  return !Number.isNaN(n) && n >= 0 && n <= 100
}, 'Enter a number between 0 and 100')

const userUsageSchema = z.object({
  QuotaAnomalyThreshold: numericString,
  QuotaWarningThresholdPct: percentString,
})

type UserUsageFormInput = z.input<typeof userUsageSchema>
type UserUsageFormValues = z.output<typeof userUsageSchema>

type UserUsageSettingsSectionProps = {
  defaultValues: {
    QuotaAnomalyThreshold: string
    QuotaWarningThresholdPct: string
  }
}

const normalizeDefaults = (
  defaults: UserUsageSettingsSectionProps['defaultValues']
) => ({
  QuotaAnomalyThreshold: (defaults.QuotaAnomalyThreshold ?? '').trim(),
  QuotaWarningThresholdPct: (defaults.QuotaWarningThresholdPct ?? '').trim(),
})

export function UserUsageSettingsSection({
  defaultValues,
}: UserUsageSettingsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const baselineRef = useRef(normalizeDefaults(defaultValues))
  const baselineSerializedRef = useRef(
    JSON.stringify(normalizeDefaults(defaultValues))
  )

  const formDefaults = useMemo<UserUsageFormInput>(
    () => normalizeDefaults(defaultValues),
    [defaultValues]
  )

  const form = useForm<UserUsageFormInput, unknown, UserUsageFormValues>({
    resolver: zodResolver(userUsageSchema),
    defaultValues: formDefaults,
  })

  useResetForm(form, formDefaults)

  useEffect(() => {
    const normalized = normalizeDefaults(defaultValues)
    const serialized = JSON.stringify(normalized)
    if (serialized === baselineSerializedRef.current) return
    baselineRef.current = normalized
    baselineSerializedRef.current = serialized
  }, [defaultValues])

  const onSubmit = async (values: UserUsageFormValues) => {
    const normalized = normalizeDefaults(values)
    const updates = (
      Object.keys(normalized) as Array<keyof typeof normalized>
    ).filter((key) => normalized[key] !== baselineRef.current[key])

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const key of updates) {
      await updateOption.mutateAsync({
        key,
        value: normalized[key],
      })
    }

    baselineRef.current = normalized
    baselineSerializedRef.current = JSON.stringify(normalized)
  }

  return (
    <SettingsSection title={t('User Usage Governance')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <FormField
              control={form.control}
              name='QuotaAnomalyThreshold'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('Quota Anomaly Threshold (tokens)')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step={1}
                      {...safeNumberFieldProps(field)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Mark a user as anomaly when their consumption in the time window exceeds this value. 0 disables the rule. 500000 tokens = $1.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='QuotaWarningThresholdPct'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('Quota Warning Threshold (%)')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      max={100}
                      step={1}
                      {...safeNumberFieldProps(field)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Mark a user as warning when their used quota exceeds (100 - this value)% of their total. 0 disables the rule. Range 0-100.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
