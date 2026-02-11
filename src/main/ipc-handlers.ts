import { ipcMain, dialog, clipboard, BrowserWindow, shell } from 'electron'
import { IPC } from '../shared/types'
import {
    loadProfiles,
    setActiveProfile,
    getActiveProfile
} from './aws/auth'
import {
    listBuckets,
    createBucket,
    deleteBucket,
    listObjects,
    deleteObjects,
    copyObject,
    headObject,
    getPresignedUrl,
    getBucketRegion,
    createFolder,
    renameObject,
    changeStorageClassBatch,
    getPrefixSize,
    getCachedPrefixSize,
    listAllKeys
} from './aws/s3-service'
import type { StorageClass } from '../shared/types'
import {
    enqueueUpload,
    enqueueDownload,
    cancelTransfer,
    pauseTransfer,
    resumeTransfer,
    getQueue,
    setProgressCallback,
    setTransferSettings,
    getTransferSettings
} from './aws/transfer-engine'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
    // ─── Auth ────────────────────────────────────────────────
    ipcMain.handle(IPC.LIST_PROFILES, () => loadProfiles())

    ipcMain.handle(IPC.SET_ACTIVE_PROFILE, (_e, profile) => {
        setActiveProfile(profile)
        return true
    })

    ipcMain.handle(IPC.GET_ACTIVE_PROFILE, () => getActiveProfile())

    // ─── S3 Operations ──────────────────────────────────────
    ipcMain.handle(IPC.LIST_BUCKETS, async () => {
        return listBuckets()
    })

    ipcMain.handle(IPC.CREATE_BUCKET, async (_e, name: string, region: string) => {
        // Validate bucket name per AWS S3 naming rules
        if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$/.test(name)) {
            throw new Error('Invalid bucket name. Must be 3-63 characters: lowercase letters, numbers, hyphens, and dots only.')
        }
        if (typeof region !== 'string' || !/^[a-z]{2}-[a-z]+-\d+$/.test(region)) {
            throw new Error('Invalid AWS region format.')
        }
        await createBucket(name, region)
        return true
    })

    ipcMain.handle(IPC.DELETE_BUCKET, async (_e, name: string) => {
        if (typeof name !== 'string' || !name.trim()) {
            throw new Error('Bucket name is required.')
        }
        await deleteBucket(name)
        return true
    })

    ipcMain.handle(IPC.LIST_OBJECTS, async (_e, bucket: string, prefix?: string, token?: string) => {
        return listObjects(bucket, prefix, token)
    })

    ipcMain.handle(IPC.DELETE_OBJECTS, async (_e, bucket: string, keys: string[]) => {
        if (typeof bucket !== 'string' || !bucket.trim()) {
            throw new Error('Bucket name is required.')
        }
        if (!Array.isArray(keys) || keys.length === 0 || !keys.every(k => typeof k === 'string')) {
            throw new Error('A non-empty array of string keys is required.')
        }
        await deleteObjects(bucket, keys)
        return true
    })

    ipcMain.handle(IPC.COPY_OBJECT, async (_e, srcBucket: string, srcKey: string, destBucket: string, destKey: string) => {
        await copyObject(srcBucket, srcKey, destBucket, destKey)
        return true
    })

    ipcMain.handle(IPC.HEAD_OBJECT, async (_e, bucket: string, key: string) => {
        return headObject(bucket, key)
    })

    ipcMain.handle(IPC.GET_PRESIGNED_URL, async (_e, bucket: string, key: string, expiresIn?: number) => {
        return getPresignedUrl(bucket, key, expiresIn)
    })

    ipcMain.handle(IPC.GET_BUCKET_REGION, async (_e, bucket: string) => {
        return getBucketRegion(bucket)
    })

    ipcMain.handle(IPC.CREATE_FOLDER, async (_e, bucket: string, key: string) => {
        await createFolder(bucket, key)
        return true
    })

    ipcMain.handle(IPC.RENAME_OBJECT, async (_e, bucket: string, oldKey: string, newKey: string) => {
        await renameObject(bucket, oldKey, newKey)
        return true
    })

    // ─── Shell ───────────────────────────────────────────────
    ipcMain.handle(IPC.OPEN_IN_BROWSER, async (_e, url: string) => {
        // Only allow http/https URLs to prevent protocol handler abuse
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
            throw new Error('Only HTTP/HTTPS URLs are allowed.')
        }
        await shell.openExternal(url)
        return true
    })

    // ─── Storage Class ──────────────────────────────────────
    ipcMain.handle(IPC.CHANGE_STORAGE_CLASS, async (_e, bucket: string, keys: string[], targetClass: StorageClass) => {
        return changeStorageClassBatch(bucket, keys, targetClass)
    })

    ipcMain.handle(IPC.GET_PREFIX_SIZE, async (_e, bucket: string, prefix: string) => {
        return getPrefixSize(bucket, prefix)
    })

    ipcMain.handle(IPC.GET_CACHED_SIZE, (_e, bucket: string, prefix: string) => {
        return getCachedPrefixSize(bucket, prefix)
    })

    ipcMain.handle(IPC.LIST_ALL_KEYS, async (_e, bucket: string, prefix: string) => {
        if (typeof bucket !== 'string' || !bucket.trim()) {
            throw new Error('Bucket name is required.')
        }
        return listAllKeys(bucket, prefix || '')
    })

    // ─── Transfer Engine ────────────────────────────────────
    ipcMain.handle(IPC.UPLOAD_FILES, async (_e, localPaths: string[], bucket: string, prefix: string) => {
        if (!Array.isArray(localPaths) || !localPaths.every(p => typeof p === 'string')) {
            throw new Error('localPaths must be an array of strings.')
        }
        if (typeof bucket !== 'string' || !bucket.trim()) {
            throw new Error('Bucket name is required.')
        }
        const jobs = localPaths.map((p) => enqueueUpload(p, bucket, prefix || ''))
        return jobs
    })

    ipcMain.handle(IPC.DOWNLOAD_FILES, async (_e, items: { bucket: string; key: string; size: number }[], localDir: string) => {
        if (typeof localDir !== 'string' || !localDir.trim()) {
            throw new Error('Download directory is required.')
        }
        const { join, basename, resolve } = await import('path')
        const resolvedDir = resolve(localDir)
        const jobs = items.map((item) => {
            const fileName = basename(item.key)
            if (!fileName || fileName === '.' || fileName === '..') {
                throw new Error(`Invalid object key: ${item.key}`)
            }
            const localPath = join(resolvedDir, fileName)
            // Ensure the resolved path stays within the target directory
            if (!localPath.startsWith(resolvedDir)) {
                throw new Error('Path traversal detected')
            }
            return enqueueDownload(item.bucket, item.key, localPath, item.size)
        })
        return jobs
    })

    ipcMain.handle(IPC.PAUSE_TRANSFER, (_e, jobId: string) => {
        pauseTransfer(jobId)
        return true
    })

    ipcMain.handle(IPC.RESUME_TRANSFER, (_e, jobId: string) => {
        resumeTransfer(jobId)
        return true
    })

    ipcMain.handle(IPC.CANCEL_TRANSFER, (_e, jobId: string) => {
        cancelTransfer(jobId)
        return true
    })

    ipcMain.handle(IPC.GET_TRANSFER_QUEUE, () => getQueue())

    // ─── Settings ───────────────────────────────────────────
    ipcMain.handle(IPC.GET_SETTINGS, () => getTransferSettings())

    ipcMain.handle(IPC.SET_SETTINGS, (_e, s) => {
        if (typeof s !== 'object' || s === null) {
            throw new Error('Settings must be a non-null object.')
        }
        // Validate numeric bounds for safety
        if (s.partSizeMB !== undefined && (typeof s.partSizeMB !== 'number' || s.partSizeMB < 5 || s.partSizeMB > 100)) {
            throw new Error('partSizeMB must be between 5 and 100.')
        }
        if (s.concurrentThreads !== undefined && (typeof s.concurrentThreads !== 'number' || s.concurrentThreads < 1 || s.concurrentThreads > 100)) {
            throw new Error('concurrentThreads must be between 1 and 100.')
        }
        if (s.maxBandwidthKBps !== undefined && (typeof s.maxBandwidthKBps !== 'number' || s.maxBandwidthKBps < 0)) {
            throw new Error('maxBandwidthKBps must be >= 0.')
        }
        setTransferSettings(s)
        return true
    })

    // ─── Dialogs ────────────────────────────────────────────
    ipcMain.handle(IPC.SHOW_OPEN_DIALOG, async (_e, options) => {
        const result = await dialog.showOpenDialog(mainWindow, options)
        return result
    })

    ipcMain.handle(IPC.SHOW_SAVE_DIALOG, async (_e, options) => {
        const result = await dialog.showSaveDialog(mainWindow, options)
        return result
    })

    // ─── Clipboard ──────────────────────────────────────────
    ipcMain.handle(IPC.COPY_TO_CLIPBOARD, (_e, text: string) => {
        clipboard.writeText(text)
        return true
    })

    // ─── Transfer progress forwarding to renderer ──────────
    bindProgressToWindow(mainWindow)
}

/**
 * Bind the transfer progress callback to a specific window.
 * Safe to call multiple times (e.g. when recreating window on macOS activate).
 */
export function bindProgressToWindow(mainWindow: BrowserWindow): void {
    setProgressCallback((job) => {
        try {
            mainWindow.webContents.send(IPC.TRANSFER_PROGRESS, job)
        } catch {
            // Window may be destroyed
        }
    })
}
