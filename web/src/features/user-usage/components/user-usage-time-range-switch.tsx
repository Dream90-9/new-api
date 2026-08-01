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
import { useTranslation } from 'react-i18next'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { USER_STATS_TIME_RANGE_DAYS } from '../constants'

interface UserUsageTimeRangeSwitchProps {
  value: number
  onChange: (days: number) => void
}

// 用 Tabs 实现的 7/30/90 天切换器，与 dashboard UserCharts 风格保持一致。
// 嵌入 DataTableToolbar 的 additionalSearch 槽位。
export function UserUsageTimeRangeSwitch({
  value,
  onChange,
}: UserUsageTimeRangeSwitchProps) {
  const { t } = useTranslation()
  return (
    <Tabs value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <TabsList>
        {USER_STATS_TIME_RANGE_DAYS.map((days) => (
          <TabsTrigger key={days} value={String(days)}>
            {t('{{count}} Days', { count: days })}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
