import type { Metadata } from 'next'
import HistoryPage from '@/components/dashboard/HistoryPage'

export const metadata: Metadata = { title: 'Analysis History — PulseRetain' }

export default function Page() {
  return <HistoryPage />
}
