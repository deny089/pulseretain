import type { Metadata } from 'next'
import RetentionPage from '@/components/dashboard/RetentionPage'

export const metadata: Metadata = { title: 'Retention Analysis — PulseRetain' }

export default function Page() {
  return <RetentionPage />
}
