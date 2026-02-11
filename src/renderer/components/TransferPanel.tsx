import { useState } from 'react'
import type { TransferJob } from '../../shared/types'

interface Props {
    transfers: TransferJob[]
}

function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec <= 0) return '—'
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function getFileName(key: string): string {
    const parts = key.split('/')
    return parts[parts.length - 1] || parts[parts.length - 2] || key
}

export default function TransferPanel({ transfers }: Props) {
    const [expanded, setExpanded] = useState(true)

    const activeCount = transfers.filter((t) =>
        t.status === 'active' || t.status === 'pending'
    ).length

    const handleCancel = async (id: string) => {
        try { await window.api.cancelTransfer(id) } catch { /* ignore */ }
    }

    const handlePause = async (id: string) => {
        try { await window.api.pauseTransfer(id) } catch { /* ignore */ }
    }

    const handleResume = async (id: string) => {
        try { await window.api.resumeTransfer(id) } catch { /* ignore */ }
    }

    return (
        <div className={`transfer-panel ${expanded ? 'transfer-panel--expanded' : 'transfer-panel--collapsed'}`}>
            <div className="transfer-panel__header" onClick={() => setExpanded(!expanded)}>
                <div className="transfer-panel__title">
                    <span>{expanded ? '▾' : '▸'}</span>
                    <span>Transfers</span>
                    {activeCount > 0 && (
                        <span className="transfer-panel__badge">{activeCount}</span>
                    )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {transfers.length} total
                </span>
            </div>

            {expanded && (
                <div className="transfer-panel__list">
                    {transfers.length === 0 && (
                        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                            No transfers yet. Drag and drop files to upload.
                        </div>
                    )}

                    {transfers.map((t) => {
                        const progress = t.fileSize > 0 ? (t.transferred / t.fileSize) * 100 : 0
                        const progressClass =
                            t.status === 'completed' ? 'transfer-item__progress-fill--completed' :
                                t.status === 'failed' ? 'transfer-item__progress-fill--failed' :
                                    'transfer-item__progress-fill--active'

                        return (
                            <div key={t.id} className="transfer-item">
                                <span className={`transfer-item__icon ${t.direction === 'upload' ? 'transfer-item__icon--upload' : 'transfer-item__icon--download'}`}>
                                    {t.direction === 'upload' ? '⬆' : '⬇'}
                                </span>

                                <div className="transfer-item__info">
                                    <div className="transfer-item__name">{getFileName(t.key)}</div>
                                    <div className="transfer-item__progress-bar">
                                        <div
                                            className={`transfer-item__progress-fill ${progressClass}`}
                                            style={{ width: `${Math.min(progress, 100)}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="transfer-item__speed">
                                    {t.status === 'active' ? formatSpeed(t.speed) :
                                        t.status === 'completed' ? formatBytes(t.fileSize) : ''}
                                </div>

                                <div className={`transfer-item__status transfer-item__status--${t.status}`}>
                                    {t.status}
                                </div>

                                <div>
                                    {t.status === 'active' && (
                                        <button className="transfer-item__action" onClick={() => handlePause(t.id)} title="Pause">
                                            ⏸
                                        </button>
                                    )}
                                    {t.status === 'paused' && (
                                        <button className="transfer-item__action" onClick={() => handleResume(t.id)} title="Resume">
                                            ▶
                                        </button>
                                    )}
                                    {(t.status === 'active' || t.status === 'pending' || t.status === 'paused') && (
                                        <button className="transfer-item__action" onClick={() => handleCancel(t.id)} title="Cancel">
                                            ✕
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
