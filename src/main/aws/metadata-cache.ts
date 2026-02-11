import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { CachedSizeInfo } from '../../shared/types'

const CACHE_DIR = join(homedir(), '.s3-client-gui')
const CACHE_FILE = join(CACHE_DIR, 'size-cache.json')

/** Max age before a cached entry is considered stale and auto-removed (7 days) */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type CacheStore = Record<string, CachedSizeInfo>

let store: CacheStore = {}

/**
 * Build a unique cache key from bucket + prefix.
 */
function cacheKey(bucket: string, prefix: string): string {
    return `${bucket}::${prefix || '/'}`
}

/**
 * Load the cache from disk on first access.
 */
function ensureLoaded(): void {
    if (Object.keys(store).length > 0) return
    try {
        if (existsSync(CACHE_FILE)) {
            const raw = readFileSync(CACHE_FILE, 'utf-8')
            const parsed: CacheStore = JSON.parse(raw)

            // Prune entries older than MAX_AGE_MS
            const now = Date.now()
            for (const [key, entry] of Object.entries(parsed)) {
                const age = now - new Date(entry.lastCalculated).getTime()
                if (age < MAX_AGE_MS) {
                    store[key] = entry
                }
            }
        }
    } catch {
        store = {}
    }
}

/**
 * Persist the cache to disk.
 */
function persist(): void {
    try {
        if (!existsSync(CACHE_DIR)) {
            mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 })
        }
        writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 })
    } catch (err) {
        console.warn('Failed to persist size cache:', err)
    }
}

/**
 * Get cached size info for a bucket/prefix.
 * Returns null if not found or expired.
 */
export function getCachedSize(bucket: string, prefix: string): CachedSizeInfo | null {
    ensureLoaded()
    const key = cacheKey(bucket, prefix)
    const entry = store[key]
    if (!entry) return null

    // Check if stale
    const age = Date.now() - new Date(entry.lastCalculated).getTime()
    if (age > MAX_AGE_MS) {
        delete store[key]
        persist()
        return null
    }

    return entry
}

/**
 * Store size info for a bucket/prefix.
 */
export function setCachedSize(bucket: string, prefix: string, totalBytes: number, objectCount: number): CachedSizeInfo {
    ensureLoaded()
    const info: CachedSizeInfo = {
        bucket,
        prefix: prefix || '/',
        totalBytes,
        objectCount,
        lastCalculated: new Date().toISOString()
    }
    store[cacheKey(bucket, prefix)] = info
    persist()
    return info
}
