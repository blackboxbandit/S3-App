import type { S3Object } from '../../shared/types'

interface Props {
    objects: S3Object[]
    selected: Set<string>
    prefix: string
    bucket: string | null
    loading: boolean
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

export default function StatusBar({ objects, selected, prefix, bucket, loading }: Props) {
    const folders = objects.filter((o) => o.isFolder).length
    const files = objects.filter((o) => !o.isFolder).length
    const totalSize = objects.reduce((sum, o) => sum + (o.isFolder ? 0 : o.size), 0)

    const selectedObjects = objects.filter((o) => selected.has(o.key))
    const selectedSize = selectedObjects.reduce((sum, o) => sum + o.size, 0)

    const pathDisplay = bucket
        ? prefix
            ? `${bucket}/${prefix.replace(/\/$/, '')}`
            : bucket
        : 'No bucket selected'

    return (
        <div className="status-bar">
            <div className="status-bar__left">
                <span className="status-bar__path" title={pathDisplay}>
                    <span className="status-bar__path-icon">📂</span>
                    {pathDisplay}
                </span>
            </div>

            <div className="status-bar__center">
                {loading ? (
                    <span className="status-bar__loading">
                        <span className="spinner spinner--sm" />
                        Loading…
                    </span>
                ) : (
                    <span className="status-bar__counts">
                        {folders > 0 && (
                            <span className="status-bar__count">
                                <span className="status-bar__count-icon">📁</span>
                                {folders} folder{folders !== 1 ? 's' : ''}
                            </span>
                        )}
                        {files > 0 && (
                            <span className="status-bar__count">
                                <span className="status-bar__count-icon">📄</span>
                                {files} file{files !== 1 ? 's' : ''}
                            </span>
                        )}
                        {totalSize > 0 && (
                            <span className="status-bar__size">{formatBytes(totalSize)}</span>
                        )}
                        {objects.length === 0 && (
                            <span className="status-bar__empty">Empty</span>
                        )}
                    </span>
                )}
            </div>

            <div className="status-bar__right">
                {selected.size > 0 && (
                    <span className="status-bar__selection">
                        <span className="status-bar__selection-badge">{selected.size}</span>
                        selected
                        {selectedSize > 0 && (
                            <span className="status-bar__selection-size">
                                ({formatBytes(selectedSize)})
                            </span>
                        )}
                    </span>
                )}
            </div>
        </div>
    )
}
