import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={cx('bg-surface border border-line rounded-xl p-5', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && <h3 className="text-base font-bold text-ink">{title}</h3>}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-deep',
  secondary: 'border border-primary text-primary-deep bg-surface hover:bg-primary-soft',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'text-ink-muted hover:text-ink hover:bg-subtle',
}

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 min-h-10 px-4 rounded-lg text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed',
        buttonVariants[variant],
        className,
      )}
      {...rest}
    />
  )
}

export type BadgeTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'

const badgeTones: Record<BadgeTone, string> = {
  ok: 'bg-primary-soft text-primary-deep',
  warn: 'bg-accent-soft text-accent-text',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-brand-blue/10 text-brand-blue',
  neutral: 'bg-subtle text-ink-muted',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export const inputClass =
  'w-full px-3 py-2 bg-surface border border-line rounded-lg text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60'

type FieldBase = { label: ReactNode; hint?: ReactNode; className?: string }

export function Field({
  label,
  hint,
  className,
  ...input
}: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cx('block', className)}>
      <span className="block text-sm font-semibold text-ink mb-1">{label}</span>
      <input className={inputClass} {...input} />
      {hint && <span className="block text-xs text-ink-muted mt-1">{hint}</span>}
    </label>
  )
}

export function SelectField({
  label,
  hint,
  className,
  children,
  ...select
}: FieldBase & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={cx('block', className)}>
      <span className="block text-sm font-semibold text-ink mb-1">{label}</span>
      <select className={inputClass} {...select}>
        {children}
      </select>
      {hint && <span className="block text-xs text-ink-muted mt-1">{hint}</span>}
    </label>
  )
}

export function TextareaField({
  label,
  hint,
  className,
  ...textarea
}: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={cx('block', className)}>
      <span className="block text-sm font-semibold text-ink mb-1">{label}</span>
      <textarea className={inputClass} {...textarea} />
      {hint && <span className="block text-xs text-ink-muted mt-1">{hint}</span>}
    </label>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted text-center py-6">{children}</p>
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-danger-soft text-danger border border-danger/30 text-sm">
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  tone?: 'ok' | 'warn' | 'danger'
}) {
  const valueColor =
    tone === 'ok'
      ? 'text-primary-deep'
      : tone === 'warn'
        ? 'text-accent-text'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-ink'
  return (
    <div className="bg-surface border border-line rounded-xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <div className={cx('mt-2 text-2xl font-bold', valueColor)}>{value}</div>
      {detail && <p className="mt-1 text-sm text-ink-muted">{detail}</p>}
    </div>
  )
}
