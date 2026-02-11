import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import ObjectBrowser from './components/ObjectBrowser'
import TransferPanel from './components/TransferPanel'
import type { AwsProfile, S3Bucket, TransferJob } from '../shared/types'

export default function App() {
    const [profiles, setProfiles] = useState<AwsProfile[]>([])
    const [activeProfile, setActiveProfile] = useState<AwsProfile | null>(null)
    const [buckets, setBuckets] = useState<S3Bucket[]>([])
    const [activeBucket, setActiveBucket] = useState<string | null>(null)
    const [transfers, setTransfers] = useState<TransferJob[]>([])
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    // Load profiles on mount
    useEffect(() => {
        window.api.listProfiles().then(setProfiles).catch(() => { })
    }, [])

    // Subscribe to transfer progress
    useEffect(() => {
        const unsubscribe = window.api.onTransferProgress((job) => {
            setTransfers((prev) => {
                const idx = prev.findIndex((t) => t.id === job.id)
                if (idx >= 0) {
                    const next = [...prev]
                    next[idx] = job
                    return next
                }
                return [...prev, job]
            })
        })
        return unsubscribe
    }, [])

    // Switch profile
    const handleProfileChange = useCallback(async (profile: AwsProfile) => {
        try {
            setError(null)
            setLoading(true)
            await window.api.setActiveProfile(profile)
            setActiveProfile(profile)
            setActiveBucket(null)
            const b = await window.api.listBuckets()
            setBuckets(b)
        } catch (err: any) {
            setError(err.message || 'Failed to connect')
            setBuckets([])
        } finally {
            setLoading(false)
        }
    }, [])

    // Select bucket
    const handleBucketSelect = useCallback((name: string) => {
        setActiveBucket(name)
        setError(null)
    }, [])

    // Refresh buckets
    const handleRefreshBuckets = useCallback(async () => {
        if (!activeProfile) return
        try {
            setLoading(true)
            const b = await window.api.listBuckets()
            setBuckets(b)
        } catch (err: any) {
            setError(err.message || 'Failed to refresh')
        } finally {
            setLoading(false)
        }
    }, [activeProfile])

    return (
        <div className="app-layout">
            {/* Title bar (draggable area for macOS) */}
            <div className="app-titlebar">
                <span className="app-titlebar__text">
                    {activeProfile ? `S3 Client — ${activeProfile.name}` : 'S3 Client'}
                </span>
            </div>

            {/* Error banner */}
            {error && (
                <div className="error-banner">
                    <span>⚠</span>
                    <span>{error}</span>
                    <button className="error-banner__dismiss" onClick={() => setError(null)}>✕</button>
                </div>
            )}

            {/* Main layout */}
            <div className="app-content">
                <Sidebar
                    profiles={profiles}
                    activeProfile={activeProfile}
                    buckets={buckets}
                    activeBucket={activeBucket}
                    loading={loading}
                    onProfileChange={handleProfileChange}
                    onBucketSelect={handleBucketSelect}
                    onRefresh={handleRefreshBuckets}
                    onCreateBucket={() => {/* TODO: open dialog */ }}
                />

                <div className="main-content">
                    {!activeProfile ? (
                        <div className="welcome">
                            <div className="welcome__glow" />
                            <div className="welcome__logo">☁️</div>
                            <h1 className="welcome__title">S3 Client</h1>
                            <p className="welcome__subtitle">
                                A next-generation cloud storage browser built for speed and elegance.
                            </p>

                            <div className="welcome__cards">
                                <div className="welcome__card">
                                    <div className="welcome__card-icon">🚀</div>
                                    <div className="welcome__card-title">Blazing Fast</div>
                                    <div className="welcome__card-text">
                                        Multi-threaded transfers with intelligent chunking
                                    </div>
                                </div>
                                <div className="welcome__card">
                                    <div className="welcome__card-icon">🔒</div>
                                    <div className="welcome__card-title">Multi-Profile</div>
                                    <div className="welcome__card-text">
                                        Switch between AWS accounts and assume roles seamlessly
                                    </div>
                                </div>
                                <div className="welcome__card">
                                    <div className="welcome__card-icon">📂</div>
                                    <div className="welcome__card-title">Smart Browse</div>
                                    <div className="welcome__card-text">
                                        Virtual folders, search, and drag-and-drop uploads
                                    </div>
                                </div>
                            </div>

                            <div className="welcome__hint">
                                Select an AWS profile from the sidebar to get started.
                                Profiles are loaded from your <code>~/.aws/credentials</code> file.
                            </div>

                            <div className="welcome__shortcuts">
                                <span className="welcome__shortcut">
                                    <kbd>⌘</kbd><kbd>R</kbd> Refresh
                                </span>
                                <span className="welcome__shortcut">
                                    <kbd>⌘</kbd><kbd>I</kbd> Inspector
                                </span>
                                <span className="welcome__shortcut">
                                    <kbd>⌘</kbd><kbd>↑</kbd> Go Up
                                </span>
                            </div>
                        </div>
                    ) : !activeBucket ? (
                        <div className="empty-state">
                            <div className="empty-state__icon">📦</div>
                            <div className="empty-state__title">Select a Bucket</div>
                            <div className="empty-state__text">
                                Choose a bucket from the sidebar to browse its contents.
                                {buckets.length === 0 && ' No buckets found for this profile.'}
                            </div>
                            {buckets.length > 0 && (
                                <div className="empty-state__badge">
                                    {buckets.length} bucket{buckets.length !== 1 ? 's' : ''} available
                                </div>
                            )}
                        </div>
                    ) : (
                        <ObjectBrowser
                            key={activeBucket}
                            bucket={activeBucket}
                            onError={setError}
                        />
                    )}
                </div>
            </div>

            {/* Transfer panel */}
            <TransferPanel transfers={transfers} />
        </div>
    )
}
