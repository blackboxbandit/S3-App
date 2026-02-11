import { useEffect, useRef } from 'react'
import type { S3Object } from '../../shared/types'

interface Props {
    x: number
    y: number
    object: S3Object
    selectedCount: number
    onClose: () => void
    onDownload: () => void
    onCopyUri: () => void
    onCopyUrl: () => void
    onCopyPresignedUrl: () => void
    onRename: () => void
    onProperties: () => void
    onChangeStorageClass: () => void
    onOpenInBrowser: () => void
    onDelete: () => void
}

export default function ContextMenu({
    x, y, object, selectedCount, onClose,
    onDownload, onCopyUri, onCopyUrl, onCopyPresignedUrl,
    onRename, onProperties, onChangeStorageClass, onOpenInBrowser, onDelete
}: Props) {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [onClose])

    // Adjust position to not overflow viewport
    const style: React.CSSProperties = {
        left: Math.min(x, window.innerWidth - 220),
        top: Math.min(y, window.innerHeight - 360)
    }

    return (
        <div className="context-menu" ref={ref} style={style}>
            {!object.isFolder && (
                <div className="context-menu__item" onClick={onDownload}>
                    <span className="context-menu__icon">⬇️</span>
                    {selectedCount > 1 ? `Download ${selectedCount} files` : 'Download'}
                </div>
            )}

            {!object.isFolder && (
                <div className="context-menu__item" onClick={onOpenInBrowser}>
                    <span className="context-menu__icon">🌐</span>
                    Open in Browser
                </div>
            )}

            <div className="context-menu__separator" />

            <div className="context-menu__item" onClick={onCopyUri}>
                <span className="context-menu__icon">📋</span>
                Copy S3 URI
            </div>

            <div className="context-menu__item" onClick={onCopyUrl}>
                <span className="context-menu__icon">🔗</span>
                Copy HTTP URL
            </div>

            {!object.isFolder && (
                <div className="context-menu__item" onClick={onCopyPresignedUrl}>
                    <span className="context-menu__icon">🔐</span>
                    Copy Pre-signed URL (1hr)
                </div>
            )}

            <div className="context-menu__separator" />

            <div className="context-menu__item" onClick={onRename}>
                <span className="context-menu__icon">✏️</span>
                Rename
                <span className="context-menu__shortcut">F2</span>
            </div>

            <div className="context-menu__item" onClick={onProperties}>
                <span className="context-menu__icon">ℹ️</span>
                Properties
                <span className="context-menu__shortcut">{navigator.platform.includes('Mac') ? '⌘I' : 'Ctrl+I'}</span>
            </div>

            <div className="context-menu__item" onClick={onChangeStorageClass}>
                <span className="context-menu__icon">⚙️</span>
                Change Storage Class
            </div>

            <div className="context-menu__separator" />

            <div className="context-menu__item context-menu__item--danger" onClick={onDelete}>
                <span className="context-menu__icon">🗑️</span>
                {selectedCount > 1 ? `Delete ${selectedCount} items` : 'Delete'}
                <span className="context-menu__shortcut">⌫</span>
            </div>
        </div>
    )
}
