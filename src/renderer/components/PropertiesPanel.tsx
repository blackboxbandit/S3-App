import { useState, useEffect } from 'react'
import type { S3Object } from '../../shared/types'

interface Props {
    bucket: string
    object: S3Object
    onClose: () => void
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0)} ${units[i]}`
}

interface ObjectMeta {
    contentLength?: number
    contentType?: string
    lastModified?: string
    etag?: string
    storageClass?: string
    metadata?: Record<string, string>
    versionId?: string
}

export default function PropertiesPanel({ bucket, object, onClose }: Props) {
    const [meta, setMeta] = useState<ObjectMeta | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (object.isFolder) {
            setLoading(false)
            return
        }
        setLoading(true)
        setError(null)
        window.api.headObject(bucket, object.key)
            .then((data) => setMeta(data as ObjectMeta))
            .catch((err: any) => setError(err.message || 'Failed to load properties'))
            .finally(() => setLoading(false))
    }, [bucket, object.key, object.isFolder])

    const rows: { label: string; value: string }[] = []

    rows.push({ label: 'Key', value: object.key })
    rows.push({ label: 'Bucket', value: bucket })
    rows.push({ label: 'S3 URI', value: `s3://${bucket}/${object.key}` })

    if (object.isFolder) {
        rows.push({ label: 'Type', value: 'Folder (virtual prefix)' })
    } else if (meta) {
        if (meta.contentType) rows.push({ label: 'Content Type', value: meta.contentType })
        if (meta.contentLength !== undefined) rows.push({ label: 'Size', value: formatBytes(meta.contentLength) })
        if (meta.lastModified) {
            const d = new Date(meta.lastModified)
            rows.push({ label: 'Last Modified', value: d.toLocaleString() })
        }
        if (meta.etag) rows.push({ label: 'ETag', value: meta.etag.replace(/"/g, '') })
        if (meta.storageClass) rows.push({ label: 'Storage Class', value: meta.storageClass })
        if (meta.versionId) rows.push({ label: 'Version ID', value: meta.versionId })
        if (meta.metadata && Object.keys(meta.metadata).length > 0) {
            for (const [k, v] of Object.entries(meta.metadata)) {
                rows.push({ label: `x-amz-meta-${k}`, value: v })
            }
        }
    }

    return (
        <div className="properties-panel">
            <div className="properties-panel__header">
                <span className="properties-panel__title">Properties</span>
                <button className="properties-panel__close" onClick={onClose} title="Close">✕</button>
            </div>

            <div className="properties-panel__body">
                {loading && (
                    <div className="loading-state">
                        <div className="spinner" />
                        <span>Loading metadata…</span>
                    </div>
                )}

                {error && (
                    <div style={{ padding: 16, color: 'var(--accent-danger)', fontSize: 12 }}>
                        {error}
                    </div>
                )}

                {!loading && !error && (
                    <div className="properties-panel__table">
                        {rows.map((row) => (
                            <div key={row.label} className="properties-panel__row">
                                <span className="properties-panel__label">{row.label}</span>
                                <span className="properties-panel__value">{row.value}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
