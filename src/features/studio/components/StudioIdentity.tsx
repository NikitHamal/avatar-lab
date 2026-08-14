type StudioIdentityProps = {
  className?: string
}

export function StudioIdentity({ className = '' }: StudioIdentityProps) {
  return (
    <div className={`studio-identity ${className}`.trim()}>
      <div className="brand">
        <span className="brand-mark" />
        Avatar <em>Lab</em>
      </div>
    </div>
  )
}
