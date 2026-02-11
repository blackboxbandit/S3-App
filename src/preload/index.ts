import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
    AwsProfile,
    S3Bucket,
    ListObjectsResult,
    TransferJob,
    TransferSettings,
    StorageClass,
    StorageClassChangeResult,
    CachedSizeInfo
} from '../shared/types'

const api = {
    // ─── Auth ────────────────────────────────────────────────
    listProfiles: (): Promise<AwsProfile[]> =>
        ipcRenderer.invoke(IPC.LIST_PROFILES),

    setActiveProfile: (profile: AwsProfile): Promise<boolean> =>
        ipcRenderer.invoke(IPC.SET_ACTIVE_PROFILE, profile),

    getActiveProfile: (): Promise<AwsProfile | null> =>
        ipcRenderer.invoke(IPC.GET_ACTIVE_PROFILE),

    // ─── S3 ──────────────────────────────────────────────────
    listBuckets: (): Promise<S3Bucket[]> =>
        ipcRenderer.invoke(IPC.LIST_BUCKETS),

    createBucket: (name: string, region: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.CREATE_BUCKET, name, region),

    deleteBucket: (name: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.DELETE_BUCKET, name),

    listObjects: (bucket: string, prefix?: string, token?: string): Promise<ListObjectsResult> =>
        ipcRenderer.invoke(IPC.LIST_OBJECTS, bucket, prefix, token),

    deleteObjects: (bucket: string, keys: string[]): Promise<boolean> =>
        ipcRenderer.invoke(IPC.DELETE_OBJECTS, bucket, keys),

    copyObject: (srcBucket: string, srcKey: string, destBucket: string, destKey: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.COPY_OBJECT, srcBucket, srcKey, destBucket, destKey),

    headObject: (bucket: string, key: string): Promise<Record<string, any>> =>
        ipcRenderer.invoke(IPC.HEAD_OBJECT, bucket, key),

    getPresignedUrl: (bucket: string, key: string, expiresIn?: number): Promise<string> =>
        ipcRenderer.invoke(IPC.GET_PRESIGNED_URL, bucket, key, expiresIn),

    getBucketRegion: (bucket: string): Promise<string> =>
        ipcRenderer.invoke(IPC.GET_BUCKET_REGION, bucket),

    createFolder: (bucket: string, key: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.CREATE_FOLDER, bucket, key),

    renameObject: (bucket: string, oldKey: string, newKey: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.RENAME_OBJECT, bucket, oldKey, newKey),

    // ─── Storage Class ──────────────────────────────────────
    changeStorageClass: (bucket: string, keys: string[], targetClass: StorageClass): Promise<StorageClassChangeResult> =>
        ipcRenderer.invoke(IPC.CHANGE_STORAGE_CLASS, bucket, keys, targetClass),

    getPrefixSize: (bucket: string, prefix: string): Promise<CachedSizeInfo> =>
        ipcRenderer.invoke(IPC.GET_PREFIX_SIZE, bucket, prefix),

    getCachedSize: (bucket: string, prefix: string): Promise<CachedSizeInfo | null> =>
        ipcRenderer.invoke(IPC.GET_CACHED_SIZE, bucket, prefix),

    listAllKeys: (bucket: string, prefix: string): Promise<{ keys: string[]; totalSize: number }> =>
        ipcRenderer.invoke(IPC.LIST_ALL_KEYS, bucket, prefix),

    // ─── Transfer ────────────────────────────────────────────
    uploadFiles: (localPaths: string[], bucket: string, prefix: string): Promise<TransferJob[]> =>
        ipcRenderer.invoke(IPC.UPLOAD_FILES, localPaths, bucket, prefix),

    downloadFiles: (items: { bucket: string; key: string; size: number }[], localDir: string): Promise<TransferJob[]> =>
        ipcRenderer.invoke(IPC.DOWNLOAD_FILES, items, localDir),

    pauseTransfer: (jobId: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.PAUSE_TRANSFER, jobId),

    resumeTransfer: (jobId: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.RESUME_TRANSFER, jobId),

    cancelTransfer: (jobId: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.CANCEL_TRANSFER, jobId),

    getTransferQueue: (): Promise<TransferJob[]> =>
        ipcRenderer.invoke(IPC.GET_TRANSFER_QUEUE),

    onTransferProgress: (callback: (job: TransferJob) => void): (() => void) => {
        const handler = (_event: any, job: TransferJob) => callback(job)
        ipcRenderer.on(IPC.TRANSFER_PROGRESS, handler)
        return () => ipcRenderer.removeListener(IPC.TRANSFER_PROGRESS, handler)
    },

    // ─── Settings ───────────────────────────────────────────
    getSettings: (): Promise<TransferSettings> =>
        ipcRenderer.invoke(IPC.GET_SETTINGS),

    setSettings: (s: Partial<TransferSettings>): Promise<boolean> =>
        ipcRenderer.invoke(IPC.SET_SETTINGS, s),

    // ─── Dialogs ────────────────────────────────────────────
    showOpenDialog: (options: any): Promise<any> =>
        ipcRenderer.invoke(IPC.SHOW_OPEN_DIALOG, options),

    showSaveDialog: (options: any): Promise<any> =>
        ipcRenderer.invoke(IPC.SHOW_SAVE_DIALOG, options),

    // ─── Clipboard ──────────────────────────────────────────
    copyToClipboard: (text: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.COPY_TO_CLIPBOARD, text),

    // ─── Shell ──────────────────────────────────────────────
    openInBrowser: (url: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.OPEN_IN_BROWSER, url)
}

contextBridge.exposeInMainWorld('api', api)

// Type declaration for renderer
export type ElectronAPI = typeof api
