import { useState } from 'react'
import { photoFileUrl } from '../lib/api'
import { formatDateOnly } from '../lib/format'
import type { AncestorNode, Animal, OffspringRow } from '../types/dashboard'
import { Badge } from './ui'

const focusClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'

function tagFallback(earTag: string): string {
  const t = earTag.trim()
  return t.slice(-3) || '—'
}

function birthShort(iso: string | null): string | null {
  const full = formatDateOnly(iso)
  if (full === '—') return null
  return full.slice(3)
}

function statusChip(status: string): { text: string; tone: 'neutral' | 'warn' | 'danger' } | null {
  if (status === 'DRY') return { text: 'Seca', tone: 'neutral' }
  if (status === 'SOLD') return { text: 'Vendido/a', tone: 'warn' }
  if (status === 'DEAD') return { text: 'Muerto/a', tone: 'danger' }
  return null
}

function NodePhoto({ src, fallback }: { src: string | null; fallback: string }) {
  const [broken, setBroken] = useState(false)
  const show = Boolean(src) && !broken
  return (
    <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden bg-accent flex items-center justify-center">
      {show ? (
        <img
          src={src!}
          alt=""
          width={40}
          height={40}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-xs font-bold text-accent-text">{fallback}</span>
      )}
    </div>
  )
}

function animalA11y(node: Extract<AncestorNode, { kind: 'ANIMAL' }>, role: string): string {
  const bits = [`${role}: caravana ${node.earTag}`]
  const born = birthShort(node.birthDate)
  if (born) bits.push(`nacida en ${born}`)
  if (node.breed) bits.push(node.breed)
  const st = statusChip(node.status)
  if (st) bits.push(st.text)
  if (node.tamboName) bits.push(`en ${node.tamboName}`)
  return bits.join(', ')
}

function NodeCard({
  node,
  role,
  token,
  currentTamboId,
  animalsById,
  highlighted,
  onSelect,
}: {
  node: AncestorNode
  role: string
  token: string
  currentTamboId: string
  animalsById: Map<string, Animal>
  highlighted?: boolean
  onSelect: (animal: Animal) => void
}) {
  if (node.kind === 'UNKNOWN') {
    return (
      <div
        className="min-h-11 min-w-[9.5rem] rounded-xl border border-dashed border-line bg-surface px-3 py-2 text-sm text-ink-muted"
        aria-label={`${role}: sin dato`}
      >
        Sin dato
      </div>
    )
  }

  if (node.kind === 'SIRE') {
    return (
      <div
        className="min-h-11 min-w-[9.5rem] rounded-xl border border-line bg-surface px-3 py-2 text-sm"
        aria-label={`${role}: toro ${node.name}${node.registrationCode ? `, ${node.registrationCode}` : ''}`}
      >
        <p className="font-bold text-ink">Toro: {node.name}</p>
        {node.registrationCode ? (
          <p className="text-xs text-ink-muted">{node.registrationCode}</p>
        ) : null}
        <p className="text-xs text-ink-muted mt-1">{node.isExternal ? 'Toro externo' : 'Toro propio'}</p>
      </div>
    )
  }

  const inList = animalsById.get(node.id)
  const otherTambo = node.tamboId !== currentTamboId
  const tappable = Boolean(inList) && !otherTambo
  const photo = node.photoUrl ? photoFileUrl(token, node.photoUrl) : null
  const born = birthShort(node.birthDate)
  const meta = [born ? `Nac. ${born}` : null, node.breed].filter(Boolean).join(' · ')
  const st = statusChip(node.status)
  const className = `min-h-11 min-w-[9.5rem] rounded-xl border bg-surface px-3 py-2 text-left text-sm ${
    highlighted ? 'border-primary ring-1 ring-primary' : 'border-line'
  } ${tappable ? `hover:bg-subtle ${focusClass}` : ''}`

  const body = (
    <>
      <div className="flex items-center gap-2">
        <NodePhoto src={photo} fallback={tagFallback(node.earTag)} />
        <div className="min-w-0">
          <p className="font-bold text-ink truncate">{node.earTag}</p>
          {meta ? <p className="text-xs text-ink-muted truncate">{meta}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {st ? <Badge tone={st.tone}>{st.text}</Badge> : null}
        {otherTambo ? <Badge tone="neutral">En {node.tamboName}</Badge> : null}
        {node.truncated ? (
          <span className="text-ink-muted text-sm" title="Tiene más ascendientes cargados">
            <span className="sr-only">Tiene más ascendientes cargados</span>…
          </span>
        ) : null}
      </div>
    </>
  )

  if (tappable && inList) {
    return (
      <button
        type="button"
        className={className}
        aria-label={animalA11y(node, role)}
        onClick={() => onSelect(inList)}
      >
        {body}
      </button>
    )
  }

  return (
    <div className={className} aria-label={animalA11y(node, role)}>
      {body}
    </div>
  )
}

function AncestorItem({
  node,
  role,
  token,
  currentTamboId,
  animalsById,
  onSelect,
  compact,
}: {
  node: AncestorNode
  role: string
  token: string
  currentTamboId: string
  animalsById: Map<string, Animal>
  onSelect: (animal: Animal) => void
  compact: boolean
}) {
  const card = (
    <NodeCard
      node={node}
      role={role}
      token={token}
      currentTamboId={currentTamboId}
      animalsById={animalsById}
      onSelect={onSelect}
    />
  )

  const showKids =
    node.kind === 'ANIMAL' &&
    !node.truncated &&
    (node.mother.kind !== 'UNKNOWN' || node.father.kind !== 'UNKNOWN')

  if (!showKids) {
    return <li className={compact ? 'ml-4 mt-2' : 'flex items-center'}>{card}</li>
  }

  if (compact) {
    return (
      <li className="ml-4 mt-2">
        <p className="text-xs font-semibold text-ink-muted mb-1">{role}</p>
        {card}
        <ul>
          <AncestorItem
            node={node.mother}
            role="Madre"
            token={token}
            currentTamboId={currentTamboId}
            animalsById={animalsById}
            onSelect={onSelect}
            compact
          />
          <AncestorItem
            node={node.father}
            role="Padre"
            token={token}
            currentTamboId={currentTamboId}
            animalsById={animalsById}
            onSelect={onSelect}
            compact
          />
        </ul>
      </li>
    )
  }

  return (
    <li className="flex flex-row-reverse items-center">
      {card}
      <div className="w-4 border-t border-line" aria-hidden />
      <ul className="flex flex-col justify-center border-r border-line pr-0">
        <li className="flex flex-row-reverse items-center py-3">
          <div className="w-4 border-t border-line" aria-hidden />
          <ul className="contents">
            <AncestorItem
              node={node.mother}
              role="Madre"
              token={token}
              currentTamboId={currentTamboId}
              animalsById={animalsById}
              onSelect={onSelect}
              compact={false}
            />
          </ul>
        </li>
        <li className="flex flex-row-reverse items-center py-3">
          <div className="w-4 border-t border-line" aria-hidden />
          <ul className="contents">
            <AncestorItem
              node={node.father}
              role="Padre"
              token={token}
              currentTamboId={currentTamboId}
              animalsById={animalsById}
              onSelect={onSelect}
              compact={false}
            />
          </ul>
        </li>
      </ul>
    </li>
  )
}

function OffspringList({
  items,
  token,
  currentTamboId,
  animalsById,
  onSelect,
}: {
  items: OffspringRow[]
  token: string
  currentTamboId: string
  animalsById: Map<string, Animal>
  onSelect: (animal: Animal) => void
}) {
  if (items.length === 0) return null
  return (
    <div>
      <h6 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">Crías</h6>
      <ul className="space-y-2">
        {items.map((kid) => {
          const fake: AncestorNode = {
            kind: 'ANIMAL',
            id: kid.id,
            earTag: kid.earTag,
            status: kid.status,
            birthDate: kid.birthDate,
            breed: kid.breed,
            photoUrl: kid.photoUrl,
            tamboId: currentTamboId,
            tamboName: '',
            mother: { kind: 'UNKNOWN' },
            father: { kind: 'UNKNOWN' },
            truncated: false,
          }
          const inList = animalsById.get(kid.id)
          return (
            <li key={kid.id} className="flex items-center gap-2">
              <NodeCard
                node={fake}
                role="Cría"
                token={token}
                currentTamboId={currentTamboId}
                animalsById={animalsById}
                onSelect={onSelect}
              />
              <span className="text-xs text-ink-muted">
                {kid.via === 'MOTHER' ? 'por madre' : 'por padre'}
                {!inList ? ' · otro tambo' : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function PedigreeTree({
  mother,
  father,
  offspring,
  root,
  token,
  currentTamboId,
  animals,
  onSelect,
}: {
  mother: AncestorNode
  father: AncestorNode
  offspring: OffspringRow[]
  root: { id: string; earTag: string; status: string; birthDate: string | null; breed?: string | null; photoUrl?: string | null; tamboId: string }
  token: string
  currentTamboId: string
  animals: Animal[]
  onSelect: (animal: Animal) => void
}) {
  const animalsById = new Map(animals.map((a) => [a.id, a]))
  const hasAncestors = mother.kind !== 'UNKNOWN' || father.kind !== 'UNKNOWN'
  const empty = !hasAncestors && offspring.length === 0

  if (empty) {
    return (
      <p className="text-sm text-ink-muted">
        Todavía no hay madre, padre ni crías cargados. Se cargan desde el celular, en la ficha de la vaca.
      </p>
    )
  }

  const rootNode: AncestorNode = {
    kind: 'ANIMAL',
    id: root.id,
    earTag: root.earTag,
    status: root.status,
    birthDate: root.birthDate,
    breed: root.breed ?? null,
    photoUrl: root.photoUrl ?? null,
    tamboId: root.tamboId,
    tamboName: '',
    mother,
    father,
    truncated: false,
  }

  const shared = {
    token,
    currentTamboId,
    animalsById,
    onSelect,
  }

  return (
    <div className="space-y-4">
      <div className="lg:hidden">
        <ul>
          <li>
            <p className="text-xs font-semibold text-ink-muted mb-1">Esta vaca</p>
            <NodeCard node={rootNode} role="Esta vaca" highlighted {...shared} />
            {hasAncestors ? (
              <ul>
                <li className="mt-3">
                  <p className="text-xs font-semibold text-ink-muted mb-1">Madre</p>
                  <NodeCard node={mother} role="Madre" {...shared} />
                  {mother.kind === 'ANIMAL' && !mother.truncated ? (
                    <ul>
                      <AncestorItem node={mother.mother} role="Madre de la madre" compact {...shared} />
                      <AncestorItem node={mother.father} role="Padre de la madre" compact {...shared} />
                    </ul>
                  ) : null}
                </li>
                <li className="mt-3">
                  <p className="text-xs font-semibold text-ink-muted mb-1">Padre</p>
                  <NodeCard node={father} role="Padre" {...shared} />
                  {father.kind === 'ANIMAL' && !father.truncated ? (
                    <ul>
                      <AncestorItem node={father.mother} role="Madre del padre" compact {...shared} />
                      <AncestorItem node={father.father} role="Padre del padre" compact {...shared} />
                    </ul>
                  ) : null}
                </li>
              </ul>
            ) : null}
          </li>
        </ul>
        <div className="mt-4">
          <OffspringList items={offspring} {...shared} />
        </div>
      </div>

      <div className="hidden lg:block overflow-x-auto pb-2">
        <div className="flex items-center gap-0 min-w-min">
          {hasAncestors ? (
            <ul className="flex flex-col justify-center">
              <li className="flex flex-row-reverse items-center py-2">
                <div className="w-4 border-t border-line" aria-hidden />
                <ul>
                  <AncestorItem node={mother} role="Madre" compact={false} {...shared} />
                </ul>
              </li>
              <li className="flex flex-row-reverse items-center py-2">
                <div className="w-4 border-t border-line" aria-hidden />
                <ul>
                  <AncestorItem node={father} role="Padre" compact={false} {...shared} />
                </ul>
              </li>
            </ul>
          ) : null}
          {hasAncestors ? <div className="w-4 self-stretch border-l border-line" aria-hidden /> : null}
          {hasAncestors ? <div className="w-4 border-t border-line" aria-hidden /> : null}
          <NodeCard node={rootNode} role="Esta vaca" highlighted {...shared} />
          {offspring.length > 0 ? <div className="w-4 border-t border-line" aria-hidden /> : null}
          {offspring.length > 0 ? (
            <div className="pl-2">
              <OffspringList items={offspring} {...shared} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
