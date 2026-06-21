'use client'

import { useEffect, useState } from 'react'
import { getCompanyDetail, getUserProfile } from '@/lib/mailtarget/api'
import type { CompanyDetail, UserProfile } from '@/lib/mailtarget/types'

function InfoRow({ label, value }: { label: string; value: string | undefined | null }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm" style={{ color: value ? 'var(--text)' : 'var(--text-muted)' }}>{value || '—'}</span>
    </div>
  )
}

export default function AccountPage() {
  const [company, setCompany]     = useState<CompanyDetail | null>(null)
  const [profile, setProfile]     = useState<UserProfile | null>(null)
  const [loading, setLoading]     = useState(true)
  const [companyErr, setCompanyErr] = useState('')
  const [profileErr, setProfileErr] = useState('')

  useEffect(() => {
    Promise.all([getCompanyDetail(), getUserProfile()]).then(([c, p]) => {
      if (c.error) setCompanyErr(c.error)
      else setCompany(c.data as CompanyDetail)
      if (p.error) setProfileErr(p.error)
      else setProfile(p.data as UserProfile)
      setLoading(false)
    })
  }, [])

  return (
    <div className="p-6 flex flex-col gap-6 w-full">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Account</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Company and profile information</p>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Company */}
          <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Company</h2>
            {companyErr ? (
              <p className="text-xs" style={{ color: 'var(--accent-neg)' }}>{companyErr}</p>
            ) : company ? (
              <>
                <InfoRow label="Name"     value={company.name} />
                <InfoRow label="Email"    value={company.email} />
                <InfoRow label="Phone"    value={company.phone} />
                <InfoRow label="Industry" value={company.industry} />
                <InfoRow label="Website"  value={company.website} />
                <InfoRow label="Timezone" value={company.timezone} />
                <InfoRow label="City"     value={company.city} />
                <InfoRow label="Country"  value={company.country} />
                <InfoRow label="Packet"   value={company.packet} />
                <InfoRow label="Expires"  value={company.expiredDate} />
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No company data available.</p>
            )}
          </div>

          {/* Profile */}
          <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>User Profile</h2>
            {profileErr ? (
              <p className="text-xs" style={{ color: 'var(--accent-neg)' }}>{profileErr}</p>
            ) : profile ? (
              <>
                {profile.image && (
                  <div className="mb-3">
                    <img src={profile.image} alt="avatar" className="w-12 h-12 rounded-full" />
                  </div>
                )}
                <InfoRow label="Full Name"  value={profile.fullname} />
                <InfoRow label="First Name" value={profile.firstname} />
                <InfoRow label="Last Name"  value={profile.lastname} />
                <InfoRow label="Email"      value={profile.email} />
                <InfoRow label="Phone"      value={profile.phone} />
                <InfoRow label="Language"   value={profile.language} />
              </>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No profile data available.</p>
            )}
          </div>
        </div>
      )}

      {/* API Info */}
      <div className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>PulseRetain Integration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            ['Email Provider', 'PulseRetain Email Engine'],
            ['Endpoints', '26 implemented'],
            ['Auth', 'Bearer Token (server-side)'],
            ['API Proxy', '/api/mailtarget/[...path]'],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span className="text-xs font-mono" style={{ color: 'var(--text-sub)' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
