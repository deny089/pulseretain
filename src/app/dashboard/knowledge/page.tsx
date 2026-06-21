import type { Metadata } from 'next'
import KnowledgePage from '@/components/dashboard/KnowledgePage'

export const metadata: Metadata = { title: 'Knowledge Sources — PulseRetain' }

export default function Page() {
  return <KnowledgePage />
}
