import {
    ListBucketsCommand,
    CreateBucketCommand,
    DeleteBucketCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    CopyObjectCommand,
    HeadObjectCommand,
    GetBucketLocationCommand,
    PutObjectCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getS3Client, createRegionalS3Client } from './auth'
import { STORAGE_CLASS_INFO } from '../../shared/types'
import type { S3Bucket, S3Object, ListObjectsResult, StorageClass, StorageClassChangeResult, CachedSizeInfo } from '../../shared/types'
import { getCachedSize, setCachedSize } from './metadata-cache'

// Cache bucket → region mapping to avoid repeated lookups
const regionCache = new Map<string, string>()

/**
 * Normalize the LocationConstraint value returned by GetBucketLocation.
 *
 * Known legacy / special values (per AWS docs):
 *   - null / undefined / ""  →  us-east-1   (original default region)
 *   - "EU"                   →  eu-west-1   (legacy alias for Europe Ireland)
 *
 * All other regions (ap-*, eu-central-1, sa-east-1, etc.) already return
 * their standard region code and need no mapping.
 */
function normalizeRegion(locationConstraint: string | undefined): string {
    if (!locationConstraint) return 'us-east-1'
    if (locationConstraint.toUpperCase() === 'EU') return 'eu-west-1'
    return locationConstraint
}

/**
 * Auto-detect the region for a bucket and return a correctly-configured client.
 */
async function getClientForBucket(bucket: string) {
    if (regionCache.has(bucket)) {
        return createRegionalS3Client(regionCache.get(bucket)!)
    }

    try {
        const client = getS3Client()
        const resp = await client.send(new GetBucketLocationCommand({ Bucket: bucket }))
        const region = normalizeRegion(resp.LocationConstraint)
        regionCache.set(bucket, region)
        return createRegionalS3Client(region)
    } catch {
        // Fall back to current client region
        return getS3Client()
    }
}

export async function getBucketRegion(bucket: string): Promise<string> {
    if (regionCache.has(bucket)) return regionCache.get(bucket)!
    try {
        const client = getS3Client()
        const resp = await client.send(new GetBucketLocationCommand({ Bucket: bucket }))
        const region = normalizeRegion(resp.LocationConstraint)
        regionCache.set(bucket, region)
        return region
    } catch {
        return 'us-east-1'
    }
}

export async function listBuckets(): Promise<S3Bucket[]> {
    const client = getS3Client()
    const resp = await client.send(new ListBucketsCommand({}))
    return (resp.Buckets || []).map((b) => ({
        name: b.Name!,
        creationDate: b.CreationDate?.toISOString()
    }))
}

export async function createBucket(name: string, region: string): Promise<void> {
    const client = createRegionalS3Client(region)
    await client.send(
        new CreateBucketCommand({
            Bucket: name,
            ...(region !== 'us-east-1'
                ? { CreateBucketConfiguration: { LocationConstraint: region as any } }
                : {})
        })
    )
}

export async function deleteBucket(name: string): Promise<void> {
    const client = await getClientForBucket(name)
    await client.send(new DeleteBucketCommand({ Bucket: name }))
}

export async function listObjects(
    bucket: string,
    prefix?: string,
    continuationToken?: string
): Promise<ListObjectsResult> {
    const client = await getClientForBucket(bucket)
    const resp = await client.send(
        new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix || undefined,
            Delimiter: '/',
            ContinuationToken: continuationToken || undefined,
            MaxKeys: 1000
        })
    )

    const objects: S3Object[] = (resp.Contents || [])
        .filter((obj) => {
            // Filter out the prefix itself (the current "folder" marker)
            if (prefix && obj.Key === prefix) return false
            return true
        })
        .map((obj) => ({
            key: obj.Key!,
            size: obj.Size || 0,
            lastModified: obj.LastModified?.toISOString() || '',
            storageClass: (obj.StorageClass as string) || 'STANDARD',
            etag: obj.ETag,
            isFolder: false
        }))

    const prefixes = (resp.CommonPrefixes || []).map((p) => p.Prefix!)

    // Add folders as virtual objects at the top
    const folders: S3Object[] = prefixes.map((p) => ({
        key: p,
        size: 0,
        lastModified: '',
        storageClass: '',
        etag: undefined,
        isFolder: true
    }))

    return {
        objects: [...folders, ...objects],
        prefixes,
        nextContinuationToken: resp.NextContinuationToken,
        isTruncated: resp.IsTruncated || false,
        keyCount: resp.KeyCount || 0
    }
}

export async function deleteObjects(bucket: string, keys: string[]): Promise<void> {
    const client = await getClientForBucket(bucket)
    // DeleteObjects supports up to 1000 keys per request
    const batches: string[][] = []
    for (let i = 0; i < keys.length; i += 1000) {
        batches.push(keys.slice(i, i + 1000))
    }
    for (const batch of batches) {
        await client.send(
            new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: {
                    Objects: batch.map((k) => ({ Key: k })),
                    Quiet: true
                }
            })
        )
    }
}

export async function copyObject(
    srcBucket: string,
    srcKey: string,
    destBucket: string,
    destKey: string
): Promise<void> {
    const client = await getClientForBucket(destBucket)
    await client.send(
        new CopyObjectCommand({
            Bucket: destBucket,
            Key: destKey,
            CopySource: encodeURIComponent(`${srcBucket}/${srcKey}`)
        })
    )
}

export async function headObject(
    bucket: string,
    key: string
): Promise<Record<string, any>> {
    const client = await getClientForBucket(bucket)
    const resp = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return {
        contentLength: resp.ContentLength,
        contentType: resp.ContentType,
        lastModified: resp.LastModified?.toISOString(),
        etag: resp.ETag,
        storageClass: resp.StorageClass,
        metadata: resp.Metadata,
        versionId: resp.VersionId
    }
}

export async function getPresignedUrl(
    bucket: string,
    key: string,
    expiresIn: number = 3600
): Promise<string> {
    // Clamp expiration: minimum 60s, maximum 12 hours (43200s)
    const safeExpiry = Math.min(Math.max(Math.floor(expiresIn), 60), 43200)
    const client = await getClientForBucket(bucket)
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: safeExpiry
    })
}

export async function createFolder(bucket: string, key: string): Promise<void> {
    const client = await getClientForBucket(bucket)
    const folderKey = key.endsWith('/') ? key : key + '/'
    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: folderKey,
            Body: '',
            ContentLength: 0
        })
    )
}

export async function renameObject(
    bucket: string,
    oldKey: string,
    newKey: string
): Promise<void> {
    if (oldKey === newKey) return
    await copyObject(bucket, oldKey, bucket, newKey)
    await deleteObjects(bucket, [oldKey])
}

/**
 * Get the current storage class of an object.
 */
export async function getObjectStorageClass(bucket: string, key: string): Promise<string> {
    const client = await getClientForBucket(bucket)
    const resp = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return resp.StorageClass || 'STANDARD'
}

/**
 * Change the storage class of a single object using copy-in-place.
 * For GLACIER and DEEP_ARCHIVE, the object must be restored first.
 */
export async function changeObjectStorageClass(
    bucket: string,
    key: string,
    targetClass: StorageClass
): Promise<void> {
    // Check if current class requires restore first
    const currentClass = await getObjectStorageClass(bucket, key)
    const classInfo = STORAGE_CLASS_INFO[currentClass as StorageClass]
    if (classInfo?.requiresRestore) {
        throw new Error(
            `Cannot change storage class of "${key}" — it is currently in ${classInfo.label}. ` +
            'You must restore the object first before changing its storage class.'
        )
    }

    const client = await getClientForBucket(bucket)
    await client.send(
        new CopyObjectCommand({
            Bucket: bucket,
            Key: key,
            CopySource: encodeURIComponent(`${bucket}/${key}`),
            StorageClass: targetClass as any,
            MetadataDirective: 'COPY'
        })
    )
}

/**
 * Change storage class for multiple objects. Returns a summary of successes and failures.
 */
export async function changeStorageClassBatch(
    bucket: string,
    keys: string[],
    targetClass: StorageClass
): Promise<StorageClassChangeResult> {
    const result: StorageClassChangeResult = { succeeded: 0, failed: [] }

    for (const key of keys) {
        try {
            await changeObjectStorageClass(bucket, key, targetClass)
            result.succeeded++
        } catch (err: any) {
            result.failed.push({ key, error: err.message || 'Unknown error' })
        }
    }

    return result
}

/**
 * Calculate the total size and object count under a prefix.
 * Caches the result for future use.
 */
export async function getPrefixSize(
    bucket: string,
    prefix: string
): Promise<CachedSizeInfo> {
    const client = await getClientForBucket(bucket)
    let totalBytes = 0
    let objectCount = 0
    let continuationToken: string | undefined

    do {
        const resp = await client.send(
            new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix || undefined,
                ContinuationToken: continuationToken,
                MaxKeys: 1000
            })
        )

        for (const obj of resp.Contents || []) {
            totalBytes += obj.Size || 0
            objectCount++
        }

        continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined
    } while (continuationToken)

    return setCachedSize(bucket, prefix, totalBytes, objectCount)
}

/**
 * Get cached size info if available, without recalculating.
 */
export function getCachedPrefixSize(bucket: string, prefix: string): CachedSizeInfo | null {
    return getCachedSize(bucket, prefix)
}

/**
 * List ALL object keys under a prefix recursively (no delimiter).
 * Returns only real object keys (not folder markers).
 * Also returns the total size in bytes.
 */
export async function listAllKeys(
    bucket: string,
    prefix: string
): Promise<{ keys: string[]; totalSize: number }> {
    const client = await getClientForBucket(bucket)
    const keys: string[] = []
    let totalSize = 0
    let continuationToken: string | undefined

    do {
        const resp = await client.send(
            new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix || undefined,
                ContinuationToken: continuationToken,
                MaxKeys: 1000
            })
        )

        for (const obj of resp.Contents || []) {
            // Skip folder marker objects (0 bytes, key ends with /)
            if (obj.Key && !(obj.Key.endsWith('/') && (obj.Size || 0) === 0)) {
                keys.push(obj.Key)
                totalSize += obj.Size || 0
            }
        }

        continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined
    } while (continuationToken)

    return { keys, totalSize }
}
