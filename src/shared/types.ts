// ─── AWS Profile ───────────────────────────────────────────
export interface AwsProfile {
    name: string
    accessKeyId?: string
    secretAccessKey?: string
    sessionToken?: string
    region?: string
    source?: 'credentials' | 'config'
}

// ─── S3 Models ─────────────────────────────────────────────
export interface S3Bucket {
    name: string
    creationDate?: string
    region?: string
}

export interface S3Object {
    key: string
    size: number
    lastModified: string
    storageClass: string
    etag?: string
    isFolder: boolean
}

export interface ListObjectsResult {
    objects: S3Object[]
    prefixes: string[]
    nextContinuationToken?: string
    isTruncated: boolean
    keyCount: number
}

// ─── Storage Class ─────────────────────────────────────────
export type StorageClass =
    | 'STANDARD'
    | 'STANDARD_IA'
    | 'ONEZONE_IA'
    | 'INTELLIGENT_TIERING'
    | 'GLACIER_IR'
    | 'GLACIER'
    | 'DEEP_ARCHIVE'
    | 'REDUCED_REDUNDANCY'
    | 'EXPRESS_ONEZONE'

export interface StorageClassInfo {
    label: string
    description: string
    retrieval: string
    deprecated: boolean
    /** Objects must be restored before class change */
    requiresRestore: boolean
}

export const STORAGE_CLASS_INFO: Record<StorageClass, StorageClassInfo> = {
    STANDARD: {
        label: 'Standard',
        description: 'Frequently accessed data with high throughput and low latency',
        retrieval: 'Instant',
        deprecated: false,
        requiresRestore: false
    },
    STANDARD_IA: {
        label: 'Standard-IA',
        description: 'Infrequently accessed data with rapid access when needed',
        retrieval: 'Instant',
        deprecated: false,
        requiresRestore: false
    },
    ONEZONE_IA: {
        label: 'One Zone-IA',
        description: 'Infrequent access, single AZ — lower cost, less resilient',
        retrieval: 'Instant',
        deprecated: false,
        requiresRestore: false
    },
    INTELLIGENT_TIERING: {
        label: 'Intelligent-Tiering',
        description: 'Auto-moves data between access tiers based on usage patterns',
        retrieval: 'Instant (frequent tier)',
        deprecated: false,
        requiresRestore: false
    },
    GLACIER_IR: {
        label: 'Glacier Instant Retrieval',
        description: 'Archive with millisecond retrieval — replaces legacy Glacier for instant access',
        retrieval: 'Milliseconds',
        deprecated: false,
        requiresRestore: false
    },
    GLACIER: {
        label: 'Glacier Flexible Retrieval',
        description: 'Archive with retrieval in minutes to hours (legacy — deprecated for new buckets Dec 2025)',
        retrieval: '1 min – 12 hrs',
        deprecated: true,
        requiresRestore: true
    },
    DEEP_ARCHIVE: {
        label: 'Glacier Deep Archive',
        description: 'Lowest-cost archive with 12–48 hour retrieval',
        retrieval: '12 – 48 hrs',
        deprecated: false,
        requiresRestore: true
    },
    REDUCED_REDUNDANCY: {
        label: 'Reduced Redundancy',
        description: 'Non-critical, easily reproducible data (legacy — not recommended)',
        retrieval: 'Instant',
        deprecated: true,
        requiresRestore: false
    },
    EXPRESS_ONEZONE: {
        label: 'Express One Zone',
        description: 'Ultra-low latency for performance-sensitive apps, single AZ',
        retrieval: 'Single-digit ms',
        deprecated: false,
        requiresRestore: false
    }
}

/**
 * Approximate $/GB/month per storage class per region.
 * Falls back to us-east-1 pricing when region not listed.
 * Source: AWS S3 Pricing (early 2026).
 */
export const STORAGE_PRICING: Record<string, Partial<Record<StorageClass, number>>> = {
    'us-east-1': {
        STANDARD: 0.023, STANDARD_IA: 0.0125, ONEZONE_IA: 0.01,
        INTELLIGENT_TIERING: 0.023, GLACIER_IR: 0.004, GLACIER: 0.0036,
        DEEP_ARCHIVE: 0.00099, REDUCED_REDUNDANCY: 0.024, EXPRESS_ONEZONE: 0.16
    },
    'us-east-2': {
        STANDARD: 0.023, STANDARD_IA: 0.0125, ONEZONE_IA: 0.01,
        INTELLIGENT_TIERING: 0.023, GLACIER_IR: 0.004, GLACIER: 0.0036,
        DEEP_ARCHIVE: 0.00099, REDUCED_REDUNDANCY: 0.024, EXPRESS_ONEZONE: 0.16
    },
    'us-west-1': {
        STANDARD: 0.026, STANDARD_IA: 0.018, ONEZONE_IA: 0.014,
        INTELLIGENT_TIERING: 0.026, GLACIER_IR: 0.005, GLACIER: 0.004,
        DEEP_ARCHIVE: 0.002, REDUCED_REDUNDANCY: 0.026
    },
    'us-west-2': {
        STANDARD: 0.023, STANDARD_IA: 0.0125, ONEZONE_IA: 0.01,
        INTELLIGENT_TIERING: 0.023, GLACIER_IR: 0.004, GLACIER: 0.0036,
        DEEP_ARCHIVE: 0.00099, REDUCED_REDUNDANCY: 0.024, EXPRESS_ONEZONE: 0.16
    },
    'eu-west-1': {
        STANDARD: 0.024, STANDARD_IA: 0.0131, ONEZONE_IA: 0.0105,
        INTELLIGENT_TIERING: 0.024, GLACIER_IR: 0.005, GLACIER: 0.0045,
        DEEP_ARCHIVE: 0.0018, REDUCED_REDUNDANCY: 0.026
    },
    'eu-west-2': {
        STANDARD: 0.024, STANDARD_IA: 0.0131, ONEZONE_IA: 0.0105,
        INTELLIGENT_TIERING: 0.024, GLACIER_IR: 0.005, GLACIER: 0.0045,
        DEEP_ARCHIVE: 0.0018, REDUCED_REDUNDANCY: 0.026
    },
    'eu-central-1': {
        STANDARD: 0.0245, STANDARD_IA: 0.0136, ONEZONE_IA: 0.0109,
        INTELLIGENT_TIERING: 0.0245, GLACIER_IR: 0.005, GLACIER: 0.0045,
        DEEP_ARCHIVE: 0.002, REDUCED_REDUNDANCY: 0.027
    },
    'ap-southeast-1': {
        STANDARD: 0.025, STANDARD_IA: 0.014, ONEZONE_IA: 0.011,
        INTELLIGENT_TIERING: 0.025, GLACIER_IR: 0.005, GLACIER: 0.005,
        DEEP_ARCHIVE: 0.002, REDUCED_REDUNDANCY: 0.028
    },
    'ap-southeast-2': {
        STANDARD: 0.025, STANDARD_IA: 0.014, ONEZONE_IA: 0.011,
        INTELLIGENT_TIERING: 0.025, GLACIER_IR: 0.005, GLACIER: 0.0045,
        DEEP_ARCHIVE: 0.002, REDUCED_REDUNDANCY: 0.028
    },
    'ap-northeast-1': {
        STANDARD: 0.025, STANDARD_IA: 0.019, ONEZONE_IA: 0.0152,
        INTELLIGENT_TIERING: 0.025, GLACIER_IR: 0.005, GLACIER: 0.005,
        DEEP_ARCHIVE: 0.002, REDUCED_REDUNDANCY: 0.028
    }
}

export const PRICING_FALLBACK_REGION = 'us-east-1'

export function getStoragePricePerGB(region: string, storageClass: StorageClass): number {
    const regionPricing = STORAGE_PRICING[region] || STORAGE_PRICING[PRICING_FALLBACK_REGION]
    return regionPricing[storageClass] ?? STORAGE_PRICING[PRICING_FALLBACK_REGION]![storageClass] ?? 0.023
}

// ─── Cached Size Info ──────────────────────────────────────
export interface CachedSizeInfo {
    bucket: string
    prefix: string
    totalBytes: number
    objectCount: number
    lastCalculated: string   // ISO 8601
}

export interface StorageClassChangeResult {
    succeeded: number
    failed: { key: string; error: string }[]
}

// ─── Transfer Engine ───────────────────────────────────────
export type TransferStatus = 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type TransferDirection = 'upload' | 'download'

export interface TransferJob {
    id: string
    direction: TransferDirection
    localPath: string
    bucket: string
    key: string
    fileSize: number
    transferred: number
    speed: number            // bytes/sec
    status: TransferStatus
    error?: string
    startedAt?: number
    completedAt?: number
}

export interface TransferSettings {
    partSizeMB: number        // 5–100
    concurrentThreads: number // 2–100
    maxBandwidthKBps: number  // 0 = unlimited
    verifyChecksum: boolean
}

// ─── IPC Channel names ─────────────────────────────────────
export const IPC = {
    // Auth
    LIST_PROFILES: 'auth:list-profiles',
    SET_ACTIVE_PROFILE: 'auth:set-active-profile',
    GET_ACTIVE_PROFILE: 'auth:get-active-profile',

    // S3
    LIST_BUCKETS: 's3:list-buckets',
    CREATE_BUCKET: 's3:create-bucket',
    DELETE_BUCKET: 's3:delete-bucket',
    LIST_OBJECTS: 's3:list-objects',
    DELETE_OBJECTS: 's3:delete-objects',
    COPY_OBJECT: 's3:copy-object',
    HEAD_OBJECT: 's3:head-object',
    GET_PRESIGNED_URL: 's3:get-presigned-url',
    GET_BUCKET_REGION: 's3:get-bucket-region',

    // Storage Class
    CHANGE_STORAGE_CLASS: 's3:change-storage-class',
    GET_PREFIX_SIZE: 's3:get-prefix-size',
    GET_CACHED_SIZE: 's3:get-cached-size',
    LIST_ALL_KEYS: 's3:list-all-keys',

    // Transfer
    UPLOAD_FILES: 'transfer:upload-files',
    DOWNLOAD_FILES: 'transfer:download-files',
    PAUSE_TRANSFER: 'transfer:pause',
    RESUME_TRANSFER: 'transfer:resume',
    CANCEL_TRANSFER: 'transfer:cancel',
    GET_TRANSFER_QUEUE: 'transfer:get-queue',
    TRANSFER_PROGRESS: 'transfer:progress',

    // Dialog
    SHOW_OPEN_DIALOG: 'dialog:open',
    SHOW_SAVE_DIALOG: 'dialog:save',

    // Settings
    GET_SETTINGS: 'settings:get',
    SET_SETTINGS: 'settings:set',

    // Clipboard
    COPY_TO_CLIPBOARD: 'clipboard:copy',

    // Create folder
    CREATE_FOLDER: 's3:create-folder',
    RENAME_OBJECT: 's3:rename-object',

    // Shell
    OPEN_IN_BROWSER: 'shell:open-in-browser'
} as const
