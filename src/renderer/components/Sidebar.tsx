import { useState, useMemo } from 'react'
import type { AwsProfile, S3Bucket } from '../../shared/types'
import CreateBucketDialog from './CreateBucketDialog'

interface SidebarProps {
    profiles: AwsProfile[]
    activeProfile: AwsProfile | null
    buckets: S3Bucket[]
    activeBucket: string | null
    loading: boolean
    onProfileChange: (profile: AwsProfile) => void
    onBucketSelect: (name: string) => void
    onRefresh: () => void
    onCreateBucket: () => void
}

const FAVORITES_KEY = 's3client:favorites'

function loadFavorites(): Set<string> {
    try {
        const stored = localStorage.getItem(FAVORITES_KEY)
        return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
        return new Set()
    }
}

function saveFavorites(favs: Set<string>) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]))
}

export default function Sidebar({
    profiles,
    activeProfile,
    buckets,
    activeBucket,
    loading,
    onProfileChange,
    onBucketSelect,
    onRefresh
}: SidebarProps) {
    const [showCreateBucket, setShowCreateBucket] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [favorites, setFavorites] = useState<Set<string>>(loadFavorites)

    const handleProfileSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const name = e.target.value
        const profile = profiles.find((p) => p.name === name)
        if (profile) onProfileChange(profile)
    }

    const handleBucketCreated = () => {
        setShowCreateBucket(false)
        onRefresh()
    }

    const toggleFavorite = (bucketName: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setFavorites((prev) => {
            const next = new Set(prev)
            if (next.has(bucketName)) {
                next.delete(bucketName)
            } else {
                next.add(bucketName)
            }
            saveFavorites(next)
            return next
        })
    }

    const filteredBuckets = useMemo(() => {
        if (!searchQuery) return buckets
        const q = searchQuery.toLowerCase()
        return buckets.filter((b) => b.name.toLowerCase().includes(q))
    }, [buckets, searchQuery])

    const favoriteBuckets = useMemo(() =>
        filteredBuckets.filter((b) => favorites.has(b.name)),
        [filteredBuckets, favorites]
    )

    const otherBuckets = useMemo(() =>
        filteredBuckets.filter((b) => !favorites.has(b.name)),
        [filteredBuckets, favorites]
    )

    return (
        <aside className="sidebar">
            {/* Profile section */}
            <div className="sidebar__header">
                <div className="sidebar__label">
                    <span>AWS Profile</span>
                </div>
                <select
                    className="profile-selector"
                    value={activeProfile?.name || ''}
                    onChange={handleProfileSelect}
                >
                    <option value="" disabled>
                        {profiles.length === 0 ? 'No profiles found' : 'Select a profile…'}
                    </option>
                    {profiles.map((p) => (
                        <option key={p.name} value={p.name}>
                            {p.name} {p.region ? `(${p.region})` : ''}
                        </option>
                    ))}
                </select>

                {activeProfile && (
                    <div className="sidebar__connection">
                        <div className="status-dot status-dot--connected" />
                        <span className="sidebar__connection-text">Connected</span>
                        {activeProfile.region && (
                            <span className="sidebar__region-badge">{activeProfile.region}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Buckets header with actions */}
            <div className="sidebar__section-header">
                <div className="sidebar__section-title">
                    <span>Buckets</span>
                    {buckets.length > 0 && (
                        <span className="sidebar__badge">{buckets.length}</span>
                    )}
                </div>
                <div className="sidebar__section-actions">
                    <button
                        className="btn btn--icon btn--sm"
                        onClick={onRefresh}
                        title="Refresh buckets"
                        disabled={!activeProfile || loading}
                    >
                        🔄
                    </button>
                    <button
                        className="btn btn--icon btn--sm"
                        onClick={() => setShowCreateBucket(true)}
                        title="Create bucket"
                        disabled={!activeProfile}
                    >
                        ＋
                    </button>
                </div>
            </div>

            {/* Bucket search */}
            {buckets.length > 3 && (
                <div className="sidebar__search">
                    <span className="sidebar__search-icon">🔍</span>
                    <input
                        className="sidebar__search-input"
                        type="text"
                        placeholder="Search buckets…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            className="sidebar__search-clear"
                            onClick={() => setSearchQuery('')}
                        >
                            ✕
                        </button>
                    )}
                </div>
            )}

            {/* Bucket list */}
            <div className="sidebar__buckets">
                {loading && (
                    <div className="loading-state">
                        <div className="spinner" />
                        <span>Loading…</span>
                    </div>
                )}

                {!loading && buckets.length === 0 && activeProfile && (
                    <div className="sidebar__empty">
                        No buckets found
                    </div>
                )}

                {/* Favorites section */}
                {!loading && favoriteBuckets.length > 0 && (
                    <>
                        <div className="sidebar__group-label">
                            <span>⭐ Favorites</span>
                        </div>
                        {favoriteBuckets.map((b) => (
                            <div
                                key={b.name}
                                className={`bucket-item ${activeBucket === b.name ? 'bucket-item--active' : ''}`}
                                onClick={() => onBucketSelect(b.name)}
                            >
                                <span className="bucket-item__icon">📦</span>
                                <span className="bucket-item__name">{b.name}</span>
                                <button
                                    className="bucket-item__fav bucket-item__fav--active"
                                    onClick={(e) => toggleFavorite(b.name, e)}
                                    title="Remove from favorites"
                                >
                                    ★
                                </button>
                            </div>
                        ))}
                    </>
                )}

                {/* All / Other buckets section */}
                {!loading && otherBuckets.length > 0 && (
                    <>
                        {favoriteBuckets.length > 0 && (
                            <div className="sidebar__group-label">
                                <span>All Buckets</span>
                            </div>
                        )}
                        {otherBuckets.map((b) => (
                            <div
                                key={b.name}
                                className={`bucket-item ${activeBucket === b.name ? 'bucket-item--active' : ''}`}
                                onClick={() => onBucketSelect(b.name)}
                            >
                                <span className="bucket-item__icon">📦</span>
                                <span className="bucket-item__name">{b.name}</span>
                                <button
                                    className="bucket-item__fav"
                                    onClick={(e) => toggleFavorite(b.name, e)}
                                    title="Add to favorites"
                                >
                                    ☆
                                </button>
                            </div>
                        ))}
                    </>
                )}

                {/* No results */}
                {!loading && searchQuery && filteredBuckets.length === 0 && (
                    <div className="sidebar__empty">
                        No buckets matching "{searchQuery}"
                    </div>
                )}
            </div>

            {showCreateBucket && (
                <CreateBucketDialog
                    onClose={() => setShowCreateBucket(false)}
                    onCreated={handleBucketCreated}
                />
            )}
        </aside>
    )
}
