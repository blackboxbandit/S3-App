import type { S3Object } from '../../shared/types'

interface Props {
    object: S3Object | null
    bucket: string
    onClose: () => void
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '—'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(iso: string): string {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric'
    }) + ' at ' + d.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
}

function getFileExtension(key: string): string {
    const parts = key.split('.')
    if (parts.length <= 1) return ''
    return parts[parts.length - 1].toUpperCase()
}

function getFileTypeIcon(key: string, isFolder: boolean): string {
    if (isFolder) return '📁'
    const ext = getFileExtension(key).toLowerCase()
    const iconMap: Record<string, string> = {
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️', bmp: '🖼️',
        mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬', webm: '🎬',
        mp3: '🎵', wav: '🎵', flac: '🎵', aac: '🎵', ogg: '🎵',
        pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
        zip: '📦', tar: '📦', gz: '📦', rar: '📦', '7z': '📦',
        json: '📋', xml: '📋', csv: '📋', yaml: '📋', yml: '📋',
        js: '⚡', ts: '⚡', py: '🐍', rb: '💎', go: '🔷',
        html: '🌐', css: '🎨', md: '📝', txt: '📝',
        exe: '⚙️', dmg: '💿', iso: '💿',
        log: '📜', sql: '🗄️', db: '🗄️'
    }
    return iconMap[ext] || '📄'
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const handleCopy = () => {
        window.api.copyToClipboard(text)
    }
    return (
        <button className="detail-panel__copy-btn" onClick={handleCopy} title={`Copy ${label}`}>
            📋
        </button>
    )
}

export default function DetailPanel({ object, bucket, onClose }: Props) {
    if (!object) {
        return (
            <div className="detail-panel">
                <div className="detail-panel__header">
                    <span className="detail-panel__header-title">Inspector</span>
                    <button className="detail-panel__close" onClick={onClose}>✕</button>
                </div>
                <div className="detail-panel__empty">
                    <div className="detail-panel__empty-icon">🔍</div>
                    <div className="detail-panel__empty-text">
                        Select a file or folder to view its details
                    </div>
                </div>
            </div>
        )
    }

    const s3Uri = `s3://${bucket}/${object.key}`
    const httpUrl = `https://${bucket}.s3.amazonaws.com/${object.key}`
    const ext = getFileExtension(object.key)
    const icon = getFileTypeIcon(object.key, object.isFolder)
    const fileName = object.key.split('/').filter(Boolean).pop() || object.key

    return (
        <div className="detail-panel">
            <div className="detail-panel__header">
                <span className="detail-panel__header-title">Inspector</span>
                <button className="detail-panel__close" onClick={onClose}>✕</button>
            </div>

            <div className="detail-panel__content">
                {/* File hero */}
                <div className="detail-panel__hero">
                    <div className="detail-panel__hero-icon">{icon}</div>
                    <div className="detail-panel__hero-name">{fileName}</div>
                    {ext && !object.isFolder && (
                        <div className="detail-panel__hero-type">{ext} File</div>
                    )}
                    {object.isFolder && (
                        <div className="detail-panel__hero-type">Folder</div>
                    )}
                </div>

                {/* Metadata rows */}
                <div className="detail-panel__section">
                    <div className="detail-panel__section-title">Details</div>

                    {!object.isFolder && (
                        <div className="detail-panel__row">
                            <span className="detail-panel__label">Size</span>
                            <span className="detail-panel__value">{formatBytes(object.size)}</span>
                        </div>
                    )}

                    {object.lastModified && (
                        <div className="detail-panel__row">
                            <span className="detail-panel__label">Modified</span>
                            <span className="detail-panel__value">{formatDate(object.lastModified)}</span>
                        </div>
                    )}

                    {object.storageClass && !object.isFolder && (
                        <div className="detail-panel__row">
                            <span className="detail-panel__label">Storage</span>
                            <span className="detail-panel__value">
                                <span className={`storage-badge storage-badge--${object.storageClass}`}>
                                    {object.storageClass.replace(/_/g, ' ')}
                                </span>
                            </span>
                        </div>
                    )}

                    {object.etag && (
                        <div className="detail-panel__row">
                            <span className="detail-panel__label">ETag</span>
                            <span className="detail-panel__value detail-panel__value--mono">
                                {object.etag.replace(/"/g, '')}
                            </span>
                        </div>
                    )}
                </div>

                {/* URIs */}
                <div className="detail-panel__section">
                    <div className="detail-panel__section-title">Locations</div>

                    <div className="detail-panel__row detail-panel__row--uri">
                        <span className="detail-panel__label">S3 URI</span>
                        <div className="detail-panel__uri-row">
                            <span className="detail-panel__value detail-panel__value--mono detail-panel__value--truncate">
                                {s3Uri}
                            </span>
                            <CopyButton text={s3Uri} label="S3 URI" />
                        </div>
                    </div>

                    <div className="detail-panel__row detail-panel__row--uri">
                        <span className="detail-panel__label">HTTP URL</span>
                        <div className="detail-panel__uri-row">
                            <span className="detail-panel__value detail-panel__value--mono detail-panel__value--truncate">
                                {httpUrl}
                            </span>
                            <CopyButton text={httpUrl} label="HTTP URL" />
                        </div>
                    </div>

                    <div className="detail-panel__row">
                        <span className="detail-panel__label">Key</span>
                        <span className="detail-panel__value detail-panel__value--mono detail-panel__value--truncate">
                            {object.key}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
