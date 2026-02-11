import { useState, useCallback, useMemo, useEffect } from 'react'
import {
    STORAGE_CLASS_INFO,
    getStoragePricePerGB
} from '../../shared/types'
import type {
    StorageClass,
    S3Object,
    StorageClassChangeResult
} from '../../shared/types'

interface Props {
    bucket: string
    region: string
    objects: S3Object[]
    onClose: () => void
    onComplete: () => void
}

/** Non-deprecated classes shown in the main table */
const TARGET_CLASSES: StorageClass[] = [
    'STANDARD',
    'INTELLIGENT_TIERING',
    'STANDARD_IA',
    'ONEZONE_IA',
    'GLACIER_IR',
    'DEEP_ARCHIVE',
    'EXPRESS_ONEZONE'
]

/** Legacy classes shown in collapsible section */
const LEGACY_CLASSES: StorageClass[] = [
    'GLACIER',
    'REDUCED_REDUNDANCY'
]

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0)} ${units[i]}`
}

function formatCost(dollars: number): string {
    if (dollars < 0.01) return `$${dollars.toFixed(4)}`
    if (dollars < 1) return `$${dollars.toFixed(3)}`
    return `$${dollars.toFixed(2)}`
}

export default function StorageClassDialog({ bucket, region, objects, onClose, onComplete }: Props) {
    const [targetClass, setTargetClass] = useState<StorageClass | null>(null)
    const [applying, setApplying] = useState(false)
    const [result, setResult] = useState<StorageClassChangeResult | null>(null)
    const [showLegacy, setShowLegacy] = useState(false)

    // ─── Folder resolution ──────────────────────────────────
    const folderObjects = useMemo(() => objects.filter(o => o.isFolder), [objects])
    const fileObjects = useMemo(() => objects.filter(o => !o.isFolder), [objects])
    const hasFolders = folderObjects.length > 0

    const [resolving, setResolving] = useState(false)
    const [resolvedKeys, setResolvedKeys] = useState<string[]>([])
    const [resolvedSize, setResolvedSize] = useState(0)
    const [resolved, setResolved] = useState(false)

    // Resolve folder contents on mount if folders are selected
    useEffect(() => {
        if (!hasFolders) {
            // No folders: use direct file keys
            setResolvedKeys(fileObjects.map(o => o.key))
            setResolvedSize(fileObjects.reduce((sum, o) => sum + o.size, 0))
            setResolved(true)
            return
        }

        let cancelled = false
        setResolving(true)

        const resolveAll = async () => {
            const allKeys = new Set(fileObjects.map(o => o.key))
            let folderSize = 0

            for (const folder of folderObjects) {
                try {
                    const result = await window.api.listAllKeys(bucket, folder.key)
                    for (const key of result.keys) {
                        allKeys.add(key)
                    }
                    folderSize += result.totalSize
                } catch {
                    // Silently skip failed folder resolution
                }
            }

            const fileSize = fileObjects.reduce((sum, o) => sum + o.size, 0)

            if (!cancelled) {
                setResolvedKeys(Array.from(allKeys))
                setResolvedSize(fileSize + folderSize)
                setResolving(false)
                setResolved(true)
            }
        }

        resolveAll()
        return () => { cancelled = true }
    }, [bucket, hasFolders, folderObjects, fileObjects])

    // Detect current storage class (filter out folders with empty class)
    const currentClasses = [...new Set(objects.filter(o => o.storageClass).map(o => o.storageClass))]
    const currentClass = currentClasses.length === 1 ? currentClasses[0] as StorageClass : null
    const hasGlacierObjects = objects.some(o =>
        o.storageClass === 'GLACIER' || o.storageClass === 'DEEP_ARCHIVE'
    )

    // Use resolved size for cost calculations
    const actualSizeGB = resolvedSize / (1024 * 1024 * 1024)
    // When size is 0 (still resolving or truly empty), use 1 GB reference
    const isReferenceSize = actualSizeGB === 0
    const sizeGB = isReferenceSize ? 1 : actualSizeGB

    // Cost map for all classes
    const costMap = useMemo(() => {
        const map = new Map<StorageClass, number>()
        for (const cls of [...TARGET_CLASSES, ...LEGACY_CLASSES]) {
            map.set(cls, getStoragePricePerGB(region, cls) * sizeGB)
        }
        return map
    }, [region, sizeGB])

    // Sort target classes by cost (ascending)
    const sortedClasses = useMemo(() => {
        return [...TARGET_CLASSES].sort((a, b) => (costMap.get(a) ?? 0) - (costMap.get(b) ?? 0))
    }, [costMap])

    const currentCost = currentClass ? costMap.get(currentClass) ?? 0 : 0
    const newCost = targetClass ? costMap.get(targetClass) ?? 0 : 0
    const isSameClass = currentClass === targetClass

    const handleApply = useCallback(async () => {
        if (applying || !targetClass || !resolved) return
        setApplying(true)
        setResult(null)

        try {
            const res = await window.api.changeStorageClass(bucket, resolvedKeys, targetClass)
            setResult(res)
            if (res.failed.length === 0) {
                setTimeout(() => {
                    onComplete()
                    onClose()
                }, 1500)
            }
        } catch (err: any) {
            setResult({ succeeded: 0, failed: [{ key: '*', error: err.message }] })
        } finally {
            setApplying(false)
        }
    }, [applying, resolvedKeys, resolved, bucket, targetClass, onComplete, onClose])

    const fileCount = resolvedKeys.length

    const renderRow = (cls: StorageClass, rank?: number, isLegacy = false) => {
        const info = STORAGE_CLASS_INFO[cls]
        const price = getStoragePricePerGB(region, cls)
        const monthlyCost = costMap.get(cls) ?? 0
        const savings = currentCost - monthlyCost
        const isSelected = targetClass === cls
        const isCurrent = currentClass === cls

        return (
            <div
                key={cls}
                className={[
                    'sc-table__row',
                    isSelected ? 'sc-table__row--selected' : '',
                    isCurrent ? 'sc-table__row--current' : '',
                    isLegacy ? 'sc-table__row--legacy' : ''
                ].join(' ')}
                onClick={() => setTargetClass(cls)}
            >
                <div className="sc-table__cell sc-table__cell--name">
                    <span className="sc-table__class-name">{info.label}</span>
                    <div className="sc-table__badges">
                        {rank === 0 && !isLegacy && <span className="sc-table__badge sc-table__badge--cheapest">✨ Cheapest</span>}
                        {rank === 1 && !isLegacy && <span className="sc-table__badge sc-table__badge--second">✨ 2nd</span>}
                        {isCurrent && <span className="sc-table__badge sc-table__badge--current">Current</span>}
                        {isLegacy && <span className="sc-table__badge sc-table__badge--deprecated">Legacy</span>}
                    </div>
                </div>
                <div className="sc-table__cell sc-table__cell--rate">
                    ${price.toFixed(4)}
                </div>
                <div className="sc-table__cell sc-table__cell--cost">
                    {formatCost(monthlyCost)}
                </div>
                <div className="sc-table__cell sc-table__cell--savings">
                    {currentClass && !isCurrent && savings !== 0 && (
                        <span className={savings > 0 ? 'sc-savings--positive' : 'sc-savings--negative'}>
                            {savings > 0 ? '↓ ' : '↑ '}{formatCost(Math.abs(savings))}
                        </span>
                    )}
                    {isCurrent && <span className="sc-savings--neutral">—</span>}
                </div>
            </div>
        )
    }

    return (
        <div className="storage-dialog__overlay" onClick={onClose}>
            <div className="storage-dialog" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="storage-dialog__header">
                    <div className="storage-dialog__title-group">
                        <h2 className="storage-dialog__title">Storage Class</h2>
                        <span className="storage-dialog__subtitle">
                            {resolving ? 'Resolving folder contents…' : (
                                <>{fileCount} object{fileCount !== 1 ? 's' : ''} · {isReferenceSize ? '1 GB reference' : formatBytes(resolvedSize)} · {region}</>
                            )}
                        </span>
                    </div>
                    <button className="storage-dialog__close" onClick={onClose}>✕</button>
                </div>

                {/* Current class indicator */}
                {currentClass && (
                    <div className="storage-dialog__current-strip">
                        <span className="storage-dialog__current-label">Current:</span>
                        <span className={`storage-badge storage-badge--${currentClass}`}>
                            {STORAGE_CLASS_INFO[currentClass]?.label || currentClass}
                        </span>
                        <span className="storage-dialog__current-cost">{formatCost(currentCost)}/mo</span>
                    </div>
                )}

                {currentClasses.length > 1 && (
                    <div className="storage-dialog__mixed-warning">
                        ⚠ Mixed storage classes: {currentClasses.join(', ')}
                    </div>
                )}

                {/* Folder recursive warning */}
                {hasFolders && resolved && (
                    <div className="storage-dialog__folder-banner">
                        <span>📂</span>
                        <span>
                            This will change the storage class for <strong>{fileCount} object{fileCount !== 1 ? 's' : ''}</strong>
                            {' '}across {folderObjects.length} folder{folderObjects.length !== 1 ? 's' : ''}
                            {resolvedSize > 0 && <> ({formatBytes(resolvedSize)} total)</>}.
                        </span>
                    </div>
                )}

                {/* Glacier warning */}
                {hasGlacierObjects && (
                    <div className="storage-dialog__glacier-banner">
                        <span className="storage-dialog__glacier-icon">🧊</span>
                        <span>Glacier/Deep Archive objects must be restored first — they will be skipped.</span>
                    </div>
                )}

                {/* Comparison table */}
                <div className="sc-table">
                    <div className="sc-table__header">
                        <div className="sc-table__cell sc-table__cell--name">Storage Class</div>
                        <div className="sc-table__cell sc-table__cell--rate">$/GB/mo</div>
                        <div className="sc-table__cell sc-table__cell--cost">Monthly</div>
                        <div className="sc-table__cell sc-table__cell--savings">Savings</div>
                    </div>
                    <div className="sc-table__body">
                        {sortedClasses.map((cls, i) => renderRow(cls, i))}

                        {/* Legacy toggle */}
                        <div className="sc-table__legacy-toggle" onClick={() => setShowLegacy(!showLegacy)}>
                            <span className="sc-table__legacy-chevron">{showLegacy ? '▾' : '▸'}</span>
                            Legacy Classes
                        </div>

                        {showLegacy && LEGACY_CLASSES.map(cls => renderRow(cls, undefined, true))}
                    </div>
                </div>

                {/* Result */}
                {result && (
                    <div className="storage-dialog__result">
                        {result.failed.length === 0 ? (
                            <div className="storage-dialog__success">
                                ✅ Changed {result.succeeded} object{result.succeeded !== 1 ? 's' : ''} to {targetClass && STORAGE_CLASS_INFO[targetClass].label}
                            </div>
                        ) : (
                            <div className="storage-dialog__failures">
                                <div>✅ {result.succeeded} succeeded, ❌ {result.failed.length} failed</div>
                                {result.failed.slice(0, 3).map((f, i) => (
                                    <div key={i} className="storage-dialog__failure-item">
                                        {f.key.split('/').pop()}: {f.error}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="storage-dialog__footer">
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button
                        className="btn btn--primary"
                        onClick={handleApply}
                        disabled={applying || resolving || !targetClass || isSameClass || result?.failed.length === 0}
                    >
                        {applying ? `Applying (${fileCount} objects)…` : resolving ? 'Resolving…' : `Apply to ${fileCount} object${fileCount !== 1 ? 's' : ''}`}
                    </button>
                </div>
            </div>
        </div>
    )
}
