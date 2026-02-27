import { createReadStream, createWriteStream, statSync } from 'fs'
import { basename } from 'path'
import { Upload } from '@aws-sdk/lib-storage'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { createRegionalS3Client } from './auth'
import { getBucketRegion } from './s3-service'
import type { TransferJob, TransferSettings } from '../../shared/types'

let settings: TransferSettings = {
    partSizeMB: 10,
    concurrentThreads: 4,
    maxBandwidthKBps: 0,
    verifyChecksum: false
}

const queue: TransferJob[] = []
let activeCount = 0
const abortControllers = new Map<string, AbortController>()
const lastEmitTime = new Map<string, number>()
let progressCallback: ((job: TransferJob) => void) | null = null

/** Maximum number of completed/failed/cancelled jobs to keep in history */
const MAX_HISTORY_SIZE = 200

let jobIdCounter = 0
function generateId(): string {
    return `transfer-${Date.now()}-${++jobIdCounter}`
}

/**
 * Prune terminal jobs from the queue to prevent unbounded memory growth.
 */
function pruneQueue(): void {
    const terminal = queue.filter(j =>
        j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled'
    )
    if (terminal.length > MAX_HISTORY_SIZE) {
        const toRemove = terminal.length - MAX_HISTORY_SIZE
        let removed = 0
        for (let i = 0; i < queue.length && removed < toRemove; i++) {
            const s = queue[i].status
            if (s === 'completed' || s === 'failed' || s === 'cancelled') {
                queue.splice(i, 1)
                i-- // adjust index after splice
                removed++
            }
        }
    }
}

export function setTransferSettings(s: Partial<TransferSettings>): void {
    settings = { ...settings, ...s }
}

export function getTransferSettings(): TransferSettings {
    return { ...settings }
}

export function setProgressCallback(cb: (job: TransferJob) => void): void {
    progressCallback = cb
}

export function getQueue(): TransferJob[] {
    return queue.map((j) => ({ ...j }))
}

function emitProgress(job: TransferJob): void {
    if (!progressCallback) return
    const now = Date.now()
    const isTerminal = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'
    if (!isTerminal) {
        const last = lastEmitTime.get(job.id) || 0
        if (now - last < 100) return
    } else {
        lastEmitTime.delete(job.id)
    }
    lastEmitTime.set(job.id, now)
    progressCallback({ ...job })
}

function processQueue(): void {
    const maxActive = settings.concurrentThreads
    while (activeCount < maxActive) {
        const next = queue.find((j) => j.status === 'pending')
        if (!next) break
        next.status = 'active'
        next.startedAt = Date.now()
        activeCount++
        emitProgress(next)

        if (next.direction === 'upload') {
            executeUpload(next).finally(() => {
                activeCount--
                pruneQueue()
                processQueue()
            })
        } else {
            executeDownload(next).finally(() => {
                activeCount--
                pruneQueue()
                processQueue()
            })
        }
    }
}

async function executeUpload(job: TransferJob): Promise<void> {
    try {
        const region = await getBucketRegion(job.bucket)
        const client = createRegionalS3Client(region)
        const abortController = new AbortController()
        abortControllers.set(job.id, abortController)

        const fileStream = createReadStream(job.localPath)
        const partSize = settings.partSizeMB * 1024 * 1024

        const upload = new Upload({
            client,
            params: {
                Bucket: job.bucket,
                Key: job.key,
                Body: fileStream
            },
            queueSize: Math.min(settings.concurrentThreads, 4),
            partSize,
            abortController
        })

        upload.on('httpUploadProgress', (progress) => {
            if (job.status === 'cancelled') return
            const loaded = Number(progress.loaded || 0)
            const elapsed = (Date.now() - (job.startedAt || Date.now())) / 1000
            job.transferred = loaded
            job.speed = elapsed > 0 ? loaded / elapsed : 0
            emitProgress(job)
        })

        await upload.done()

        if (job.status !== 'cancelled') {
            job.status = 'completed'
            job.transferred = job.fileSize
            job.completedAt = Date.now()
            emitProgress(job)
        }
    } catch (err: any) {
        if (job.status !== 'cancelled') {
            job.status = 'failed'
            job.error = err.message || 'Upload failed'
            emitProgress(job)
        }
    } finally {
        abortControllers.delete(job.id)
    }
}

async function executeDownload(job: TransferJob): Promise<void> {
    try {
        const region = await getBucketRegion(job.bucket)
        const client = createRegionalS3Client(region)
        const abortController = new AbortController()
        abortControllers.set(job.id, abortController)

        const resp = await client.send(
            new GetObjectCommand({ Bucket: job.bucket, Key: job.key }),
            { abortSignal: abortController.signal }
        )

        if (!resp.Body) throw new Error('Empty response body')

        const writeStream = createWriteStream(job.localPath)
        const body = resp.Body as Readable
        let downloaded = 0

        await new Promise<void>((resolve, reject) => {
            body.on('data', (chunk: Buffer) => {
                if (job.status === 'cancelled') {
                    body.destroy()
                    writeStream.destroy()
                    return
                }
                downloaded += chunk.length
                job.transferred = downloaded
                const elapsed = (Date.now() - (job.startedAt || Date.now())) / 1000
                job.speed = elapsed > 0 ? downloaded / elapsed : 0
                emitProgress(job)
            })

            body.pipe(writeStream)
            writeStream.on('finish', resolve)
            writeStream.on('error', reject)
            body.on('error', reject)
        })

        if (job.status !== 'cancelled') {
            job.status = 'completed'
            job.completedAt = Date.now()
            emitProgress(job)
        }
    } catch (err: any) {
        if (job.status !== 'cancelled') {
            job.status = 'failed'
            job.error = err.message || 'Download failed'
            emitProgress(job)
        }
    } finally {
        abortControllers.delete(job.id)
    }
}

export function enqueueUpload(
    localPath: string,
    bucket: string,
    prefix: string
): TransferJob {
    const fileName = basename(localPath)
    let fileSize = 0
    try {
        fileSize = statSync(localPath).size
    } catch { /* ignore */ }

    const key = prefix ? `${prefix}${fileName}` : fileName
    const job: TransferJob = {
        id: generateId(),
        direction: 'upload',
        localPath,
        bucket,
        key,
        fileSize,
        transferred: 0,
        speed: 0,
        status: 'pending'
    }

    queue.push(job)
    emitProgress(job)
    processQueue()
    return job
}

export function enqueueDownload(
    bucket: string,
    key: string,
    localPath: string,
    fileSize: number
): TransferJob {
    const job: TransferJob = {
        id: generateId(),
        direction: 'download',
        localPath,
        bucket,
        key,
        fileSize,
        transferred: 0,
        speed: 0,
        status: 'pending'
    }

    queue.push(job)
    emitProgress(job)
    processQueue()
    return job
}

export function cancelTransfer(jobId: string): void {
    const job = queue.find((j) => j.id === jobId)
    if (!job) return
    job.status = 'cancelled'
    const controller = abortControllers.get(jobId)
    if (controller) {
        controller.abort()
        abortControllers.delete(jobId)
    }
    emitProgress(job)
}

export function pauseTransfer(jobId: string): void {
    const job = queue.find((j) => j.id === jobId)
    if (!job || job.status !== 'active') return
    job.status = 'paused'
    const controller = abortControllers.get(jobId)
    if (controller) {
        controller.abort()
        abortControllers.delete(jobId)
    }
    activeCount--
    emitProgress(job)
}

export function resumeTransfer(jobId: string): void {
    const job = queue.find((j) => j.id === jobId)
    if (!job || job.status !== 'paused') return
    job.status = 'pending'
    job.transferred = 0 // Re-upload from beginning for now (SQLite resume in Phase II)
    emitProgress(job)
    processQueue()
}

export function clearCompleted(): void {
    for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].status === 'completed' || queue[i].status === 'failed' || queue[i].status === 'cancelled') {
            queue.splice(i, 1)
        }
    }
}
