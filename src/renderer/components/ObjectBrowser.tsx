import { useState, useEffect, useCallback, useRef } from 'react'
import type { S3Object, ListObjectsResult } from '../../shared/types'
import ContextMenu from './ContextMenu'
import DetailPanel from './DetailPanel'
import StatusBar from './StatusBar'
import StorageClassDialog from './StorageClassDialog'

type ViewMode = 'list' | 'grid'

interface Props {
    bucket: string
    onError: (msg: string) => void
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
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function getDisplayName(key: string, prefix: string): string {
    const stripped = key.startsWith(prefix) ? key.slice(prefix.length) : key
    return stripped.endsWith('/') ? stripped.slice(0, -1) : stripped
}

function getFileTypeIcon(key: string, isFolder: boolean): string {
    if (isFolder) return '📁'
    const ext = key.split('.').pop()?.toLowerCase() || ''
    const iconMap: Record<string, string> = {
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
        mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
        mp3: '🎵', wav: '🎵', flac: '🎵',
        pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
        zip: '📦', tar: '📦', gz: '📦',
        json: '📋', xml: '📋', csv: '📋',
        js: '⚡', ts: '⚡', py: '🐍',
        html: '🌐', css: '🎨', md: '📝', txt: '📝',
        log: '📜', sql: '🗄️'
    }
    return iconMap[ext] || '📄'
}

export default function ObjectBrowser({ bucket, onError }: Props) {
    const [objects, setObjects] = useState<S3Object[]>([])
    const [prefix, setPrefix] = useState('')
    const [loading, setLoading] = useState(false)
    const [continuationToken, setContinuationToken] = useState<string | undefined>()
    const [hasMore, setHasMore] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState('')
    const [isDragOver, setIsDragOver] = useState(false)
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; object: S3Object } | null>(null)
    const [viewMode, setViewMode] = useState<ViewMode>('list')
    const [showDetailPanel, setShowDetailPanel] = useState(false)
    const [showStorageClassDialog, setShowStorageClassDialog] = useState(false)
    const [region, setRegion] = useState('us-east-1')

    const listRef = useRef<HTMLDivElement>(null)

    // Fetch bucket region
    useEffect(() => {
        window.api.getBucketRegion(bucket).then(setRegion).catch(() => {
            // Silently fallback to default
        })
    }, [bucket])

    // Fetch objects
    const fetchObjects = useCallback(async (p: string, token?: string, append = false) => {
        try {
            setLoading(true)
            const result: ListObjectsResult = await window.api.listObjects(bucket, p || undefined, token)
            if (append) {
                setObjects((prev) => [...prev, ...result.objects])
            } else {
                setObjects(result.objects)
            }
            setContinuationToken(result.nextContinuationToken)
            setHasMore(result.isTruncated)
        } catch (err: any) {
            onError(err.message || 'Failed to list objects')
        } finally {
            setLoading(false)
        }
    }, [bucket, onError])

    // Load on bucket or prefix change
    useEffect(() => {
        setObjects([])
        setSelected(new Set())
        setContinuationToken(undefined)
        setSearchQuery('')
        fetchObjects(prefix)
    }, [bucket, prefix, fetchObjects])

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey) {
                if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    handleGoUp()
                } else if (e.key === 'r') {
                    e.preventDefault()
                    fetchObjects(prefix)
                } else if (e.key === 'i') {
                    e.preventDefault()
                    setShowDetailPanel(prev => !prev)
                } else if (e.key === 'a') {
                    e.preventDefault()
                    setSelected(new Set(filteredObjects.map(o => o.key)))
                }
            }
            if (e.key === 'Escape') {
                setSelected(new Set())
                setContextMenu(null)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [prefix, objects])

    // Navigate into a folder
    const handleNavigate = (key: string) => {
        setPrefix(key)
    }

    // Go up one level
    const handleGoUp = () => {
        if (!prefix) return
        const parts = prefix.replace(/\/$/, '').split('/')
        parts.pop()
        setPrefix(parts.length > 0 ? parts.join('/') + '/' : '')
    }

    // Row click
    const handleRowClick = (obj: S3Object, e: React.MouseEvent) => {
        if (e.metaKey || e.ctrlKey) {
            setSelected((prev) => {
                const next = new Set(prev)
                if (next.has(obj.key)) next.delete(obj.key)
                else next.add(obj.key)
                return next
            })
        } else if (e.shiftKey && selected.size > 0) {
            // Shift-click range selection
            const lastSelected = Array.from(selected).pop()
            const lastIdx = filteredObjects.findIndex(o => o.key === lastSelected)
            const currentIdx = filteredObjects.findIndex(o => o.key === obj.key)
            if (lastIdx >= 0 && currentIdx >= 0) {
                const start = Math.min(lastIdx, currentIdx)
                const end = Math.max(lastIdx, currentIdx)
                const range = filteredObjects.slice(start, end + 1).map(o => o.key)
                setSelected(prev => new Set([...prev, ...range]))
            }
        } else {
            setSelected(new Set([obj.key]))
        }
    }

    // Context menu
    const handleContextMenu = (e: React.MouseEvent, obj: S3Object) => {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY, object: obj })
        if (!selected.has(obj.key)) {
            setSelected(new Set([obj.key]))
        }
    }

    // Load more (infinite scroll)
    const handleScroll = () => {
        if (!listRef.current || loading || !hasMore) return
        const { scrollTop, scrollHeight, clientHeight } = listRef.current
        if (scrollHeight - scrollTop - clientHeight < 200) {
            fetchObjects(prefix, continuationToken, true)
        }
    }

    // Drag and drop upload
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(false)

        const files = e.dataTransfer.files
        if (files.length === 0) return

        const paths: string[] = []
        for (let i = 0; i < files.length; i++) {
            const file = files[i] as any
            if (file.path) paths.push(file.path)
        }

        if (paths.length > 0) {
            try {
                await window.api.uploadFiles(paths, bucket, prefix)
            } catch (err: any) {
                onError(err.message || 'Upload failed')
            }
        }
    }

    // Context menu actions
    const handleCopyUri = (obj: S3Object) => {
        window.api.copyToClipboard(`s3://${bucket}/${obj.key}`)
        setContextMenu(null)
    }

    const handleCopyUrl = (obj: S3Object) => {
        window.api.copyToClipboard(`https://${bucket}.s3.amazonaws.com/${obj.key}`)
        setContextMenu(null)
    }

    const handleDelete = async () => {
        if (selected.size === 0) return
        const keys = Array.from(selected)
        try {
            await window.api.deleteObjects(bucket, keys)
            setSelected(new Set())
            fetchObjects(prefix)
        } catch (err: any) {
            onError(err.message || 'Delete failed')
        }
        setContextMenu(null)
    }

    const handleDownload = async (obj: S3Object) => {
        setContextMenu(null)
        try {
            const result = await window.api.showSaveDialog({
                defaultPath: getDisplayName(obj.key, prefix)
            })
            if (!result.canceled && result.filePath) {
                await window.api.downloadFiles(
                    [{ bucket, key: obj.key, size: obj.size }],
                    result.filePath.replace(/\/[^/]+$/, '')
                )
            }
        } catch (err: any) {
            onError(err.message || 'Download failed')
        }
    }

    const handleGetPresignedUrl = async (obj: S3Object) => {
        try {
            const url = await window.api.getPresignedUrl(bucket, obj.key, 3600)
            await window.api.copyToClipboard(url)
        } catch (err: any) {
            onError(err.message || 'Failed to generate URL')
        }
        setContextMenu(null)
    }

    const handleUploadClick = async () => {
        try {
            const result = await window.api.showOpenDialog({
                properties: ['openFile', 'multiSelections']
            })
            if (!result.canceled && result.filePaths.length > 0) {
                await window.api.uploadFiles(result.filePaths, bucket, prefix)
            }
        } catch (err: any) {
            onError(err.message || 'Upload failed')
        }
    }

    const handleCreateFolder = async () => {
        const name = prompt('Folder name:')
        if (!name) return
        try {
            const key = prefix + name.replace(/\/*$/, '') + '/'
            await window.api.createFolder(bucket, key)
            fetchObjects(prefix)
        } catch (err: any) {
            onError(err.message || 'Failed to create folder')
        }
    }

    // Breadcrumb segments
    const breadcrumbs = [{ label: bucket, prefix: '' }]
    if (prefix) {
        const parts = prefix.replace(/\/$/, '').split('/')
        let cumulative = ''
        for (const part of parts) {
            cumulative += part + '/'
            breadcrumbs.push({ label: part, prefix: cumulative })
        }
    }

    // Filter by search query
    const filteredObjects = searchQuery
        ? objects.filter((o) =>
            getDisplayName(o.key, prefix).toLowerCase().includes(searchQuery.toLowerCase())
        )
        : objects

    // Get currently selected object for detail panel
    const selectedKeys = Array.from(selected)
    const selectedObject = selectedKeys.length === 1
        ? objects.find(o => o.key === selectedKeys[0]) || null
        : null

    // Get selected objects for storage class dialog
    const selectedObjectsForDialog = objects.filter(o => selected.has(o.key))

    return (
        <div
            className="object-browser"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => setContextMenu(null)}
        >
            {/* Toolbar */}
            <div className="toolbar">
                {/* Navigation group */}
                <div className="toolbar__group">
                    <button
                        className="btn btn--icon"
                        onClick={handleGoUp}
                        disabled={!prefix}
                        title="Go up (⌘↑)"
                    >
                        ⬆
                    </button>
                    <button
                        className="btn btn--icon"
                        onClick={() => fetchObjects(prefix)}
                        title="Refresh (⌘R)"
                    >
                        🔄
                    </button>
                </div>

                <div className="toolbar__divider" />

                <div className="toolbar__breadcrumb">
                    {breadcrumbs.map((crumb, i) => (
                        <span key={crumb.prefix} style={{ display: 'flex', alignItems: 'center' }}>
                            {i === 0 && <span className="breadcrumb__icon">📦</span>}
                            {i > 0 && <span className="breadcrumb__separator">›</span>}
                            <span
                                className={`breadcrumb__segment ${i === breadcrumbs.length - 1 ? 'breadcrumb__segment--active' : ''}`}
                                onClick={() => setPrefix(crumb.prefix)}
                            >
                                {crumb.label}
                            </span>
                        </span>
                    ))}
                </div>

                <div className="toolbar__divider" />

                <div className="search-wrapper">
                    <span className="search-wrapper__icon">🔍</span>
                    <input
                        className="search-input"
                        type="text"
                        placeholder="Filter objects…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="toolbar__divider" />

                {/* Action group */}
                <div className="toolbar__group">
                    <button className="btn" onClick={handleCreateFolder} title="New Folder">
                        📁 New Folder
                    </button>
                    <button
                        className="btn"
                        onClick={() => setShowStorageClassDialog(true)}
                        disabled={selected.size === 0}
                        title="Compare storage classes & optimize cost"
                    >
                        💰 Storage
                    </button>
                    <button className="btn btn--primary" onClick={handleUploadClick} title="Upload files">
                        ⬆ Upload
                    </button>
                </div>

                <div className="toolbar__divider" />

                {/* View mode group */}
                <div className="toolbar__group toolbar__view-toggle">
                    <button
                        className={`btn btn--icon ${viewMode === 'list' ? 'btn--view-active' : ''}`}
                        onClick={() => setViewMode('list')}
                        title="List view"
                    >
                        ☰
                    </button>
                    <button
                        className={`btn btn--icon ${viewMode === 'grid' ? 'btn--view-active' : ''}`}
                        onClick={() => setViewMode('grid')}
                        title="Grid view"
                    >
                        ⊞
                    </button>
                </div>

                <button
                    className={`btn btn--icon ${showDetailPanel ? 'btn--view-active' : ''}`}
                    onClick={() => setShowDetailPanel(!showDetailPanel)}
                    title="Toggle inspector (⌘I)"
                >
                    ⓘ
                </button>
            </div>

            {/* Content area with optional detail panel */}
            <div className="object-browser__content">
                {/* Main object list */}
                <div className="object-browser__main">
                    {viewMode === 'list' ? (
                        /* List View */
                        <div className="object-table" ref={listRef} onScroll={handleScroll}>
                            <div className="object-table__header">
                                <span className="object-table__header-cell">Name</span>
                                <span className="object-table__header-cell">Size</span>
                                <span className="object-table__header-cell">Last Modified</span>
                                <span className="object-table__header-cell">Class</span>
                            </div>

                            {filteredObjects.map((obj, index) => (
                                <div
                                    key={obj.key}
                                    className={`object-row ${selected.has(obj.key) ? 'object-row--selected' : ''}`}
                                    onClick={(e) => handleRowClick(obj, e)}
                                    onContextMenu={(e) => handleContextMenu(e, obj)}
                                    onDoubleClick={() => obj.isFolder && handleNavigate(obj.key)}
                                    style={{ animationDelay: `${Math.min(index * 20, 400)}ms` }}
                                >
                                    <div className="object-row__name">
                                        <span className={`object-row__icon ${obj.isFolder ? 'object-row__icon--folder' : 'object-row__icon--file'}`}>
                                            {getFileTypeIcon(obj.key, obj.isFolder)}
                                        </span>
                                        <span className="object-row__name-text">
                                            {getDisplayName(obj.key, prefix)}
                                        </span>
                                    </div>
                                    <span className="object-row__size">{formatBytes(obj.size)}</span>
                                    <span className="object-row__date">{formatDate(obj.lastModified)}</span>
                                    <span className="object-row__class">
                                        {obj.isFolder ? (
                                            <span className="storage-badge storage-badge--folder">Folder</span>
                                        ) : obj.storageClass && (
                                            <span className={`storage-badge storage-badge--${obj.storageClass}`}>
                                                {obj.storageClass.replace(/_/g, ' ')}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* Grid View */
                        <div className="object-grid" ref={listRef} onScroll={handleScroll}>
                            {filteredObjects.map((obj, index) => (
                                <div
                                    key={obj.key}
                                    className={`object-card ${selected.has(obj.key) ? 'object-card--selected' : ''}`}
                                    onClick={(e) => handleRowClick(obj, e)}
                                    onContextMenu={(e) => handleContextMenu(e, obj)}
                                    onDoubleClick={() => obj.isFolder && handleNavigate(obj.key)}
                                    style={{ animationDelay: `${Math.min(index * 30, 600)}ms` }}
                                >
                                    <div className="object-card__icon">
                                        {getFileTypeIcon(obj.key, obj.isFolder)}
                                    </div>
                                    <div className="object-card__name">
                                        {getDisplayName(obj.key, prefix)}
                                    </div>
                                    {!obj.isFolder && (
                                        <div className="object-card__meta">
                                            {formatBytes(obj.size)}
                                        </div>
                                    )}
                                    {obj.isFolder && (
                                        <div className="object-card__meta">Folder</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {loading && (
                        <div className="loading-state">
                            <div className="spinner" />
                            <span>Loading objects…</span>
                        </div>
                    )}

                    {!loading && filteredObjects.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state__icon">📂</div>
                            <div className="empty-state__title">
                                {searchQuery ? 'No matches found' : 'Empty Folder'}
                            </div>
                            <div className="empty-state__text">
                                {searchQuery
                                    ? 'Try a different search term.'
                                    : 'Drag and drop files here to upload, or use the buttons below.'}
                            </div>
                            {!searchQuery && (
                                <div className="empty-state__actions">
                                    <button className="btn btn--primary" onClick={handleUploadClick}>
                                        ⬆ Upload Files
                                    </button>
                                    <button className="btn" onClick={handleCreateFolder}>
                                        📁 New Folder
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {hasMore && !loading && (
                        <div className="loading-state" style={{ cursor: 'pointer' }} onClick={() => fetchObjects(prefix, continuationToken, true)}>
                            <span style={{ color: 'var(--accent-primary)', fontSize: 12 }}>Load more…</span>
                        </div>
                    )}
                </div>

                {/* Detail Panel */}
                {showDetailPanel && (
                    <DetailPanel
                        object={selectedObject}
                        bucket={bucket}
                        onClose={() => setShowDetailPanel(false)}
                    />
                )}
            </div>

            {/* Status Bar */}
            <StatusBar
                objects={objects}
                selected={selected}
                prefix={prefix}
                bucket={bucket}
                loading={loading}
            />

            {/* Storage Class Dialog */}
            {showStorageClassDialog && (
                <StorageClassDialog
                    bucket={bucket}
                    region={region}
                    objects={selectedObjectsForDialog}
                    onClose={() => setShowStorageClassDialog(false)}
                    onComplete={() => fetchObjects(prefix)}
                />
            )}

            {/* Drag overlay */}
            {isDragOver && (
                <div className="drop-zone-overlay">
                    <div className="drop-zone-overlay__content">
                        <div className="drop-zone-overlay__icon">⬆️</div>
                        <div className="drop-zone-overlay__text">Drop files to upload to {bucket}</div>
                    </div>
                </div>
            )}

            {/* Context menu */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    object={contextMenu.object}
                    selectedCount={selected.size}
                    onClose={() => setContextMenu(null)}
                    onDownload={() => handleDownload(contextMenu.object)}
                    onCopyUri={() => handleCopyUri(contextMenu.object)}
                    onCopyUrl={() => handleCopyUrl(contextMenu.object)}
                    onCopyPresignedUrl={() => handleGetPresignedUrl(contextMenu.object)}
                    onRename={() => { setContextMenu(null) }}
                    onProperties={() => { setShowDetailPanel(true); setContextMenu(null) }}
                    onChangeStorageClass={() => { setShowStorageClassDialog(true); setContextMenu(null) }}
                    onOpenInBrowser={() => {
                        window.api.copyToClipboard(`https://${bucket}.s3.amazonaws.com/${contextMenu.object.key}`)
                        setContextMenu(null)
                    }}
                    onDelete={handleDelete}
                />
            )}
        </div>
    )
}
