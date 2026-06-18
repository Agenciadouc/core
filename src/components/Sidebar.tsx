import type { MetaAccount } from '../lib/api'

interface Props {
  account: MetaAccount
  active: boolean
  onClick: () => void
}

function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter((w) => w.length > 0 && w[0] !== w[0].toLowerCase())
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || name.slice(0, 2).toUpperCase()
}

function formatSpent(cents: string): string {
  const val = parseInt(cents) / 100
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Sidebar({ account, active, onClick }: Props) {
  return (
    <div className={`account-item ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="account-avatar">{getInitials(account.name)}</div>
      <div className="account-info">
        <div className="name">{account.name}</div>
        <div className="spend">Total: {formatSpent(account.amount_spent)}</div>
      </div>
    </div>
  )
}
