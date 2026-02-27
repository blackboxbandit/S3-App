import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import * as ini from 'ini'
import { S3Client } from '@aws-sdk/client-s3'
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts'
import type { AwsProfile } from '../../shared/types'

const AWS_DIR = join(homedir(), '.aws')
const CREDENTIALS_PATH = join(AWS_DIR, 'credentials')
const CONFIG_PATH = join(AWS_DIR, 'config')

let activeProfile: AwsProfile | null = null
let s3Client: S3Client | null = null
const clientCache = new Map<string, S3Client>()

/**
 * Parse ~/.aws/credentials and ~/.aws/config to discover named profiles.
 */
export function loadProfiles(): AwsProfile[] {
    const profiles: AwsProfile[] = []
    const seen = new Set<string>()

    // Parse credentials file
    if (existsSync(CREDENTIALS_PATH)) {
        try {
            const raw = readFileSync(CREDENTIALS_PATH, 'utf-8')
            const parsed = ini.parse(raw)
            for (const [section, values] of Object.entries(parsed)) {
                if (typeof values !== 'object' || values === null) continue
                const v = values as Record<string, string>
                const name = section.replace(/^profile\s+/, '')
                if (!seen.has(name)) {
                    seen.add(name)
                    profiles.push({
                        name,
                        accessKeyId: v.aws_access_key_id,
                        secretAccessKey: v.aws_secret_access_key,
                        sessionToken: v.aws_session_token,
                        region: v.region,
                        source: 'credentials'
                    })
                }
            }
        } catch {
            console.warn('Failed to parse AWS credentials file')
        }
    }

    // Parse config file for additional profiles & region overrides
    if (existsSync(CONFIG_PATH)) {
        try {
            const raw = readFileSync(CONFIG_PATH, 'utf-8')
            const parsed = ini.parse(raw)
            for (const [section, values] of Object.entries(parsed)) {
                if (typeof values !== 'object' || values === null) continue
                const v = values as Record<string, string>
                const name = section.replace(/^profile\s+/, '')
                const existing = profiles.find((p) => p.name === name)
                if (existing) {
                    // Merge region from config into existing credentials profile
                    if (v.region && !existing.region) {
                        existing.region = v.region
                    }
                } else if (!seen.has(name)) {
                    seen.add(name)
                    profiles.push({
                        name,
                        region: v.region,
                        source: 'config'
                    })
                }
            }
        } catch {
            console.warn('Failed to parse AWS config file')
        }
    }

    return profiles
}

/**
 * Set the active profile and create a new S3Client.
 */
export function setActiveProfile(profile: AwsProfile): void {
    activeProfile = profile
    s3Client = createS3Client(profile)
    clientCache.clear() // invalidate cached regional clients on profile switch
}

export function getActiveProfile(): AwsProfile | null {
    return activeProfile
}

/**
 * Get the current S3Client, or throw if no profile is active.
 */
export function getS3Client(): S3Client {
    if (!s3Client) {
        throw new Error('No active AWS profile. Please select a profile first.')
    }
    return s3Client
}

/**
 * Create an S3Client configured for a given profile.
 */
export function createS3Client(profile: AwsProfile, regionOverride?: string): S3Client {
    const region = regionOverride || profile.region || 'us-east-1'
    const credentials =
        profile.accessKeyId && profile.secretAccessKey
            ? {
                accessKeyId: profile.accessKeyId,
                secretAccessKey: profile.secretAccessKey,
                sessionToken: profile.sessionToken
            }
            : undefined

    return new S3Client({
        region,
        credentials,
        // Use path-style for compatibility with non-AWS S3 endpoints
        forcePathStyle: false
    })
}

/**
 * Create an S3Client pinned to a specific bucket's region.
 */
export function createRegionalS3Client(region: string): S3Client {
    if (!activeProfile) {
        throw new Error('No active AWS profile.')
    }
    const cached = clientCache.get(region)
    if (cached) return cached
    const client = createS3Client(activeProfile, region)
    clientCache.set(region, client)
    return client
}

/**
 * Assume an IAM Role via STS and return temporary credentials as a profile.
 */
export async function assumeRole(
    roleArn: string,
    sessionName?: string,
    mfaSerial?: string,
    mfaToken?: string
): Promise<AwsProfile> {
    if (!activeProfile) {
        throw new Error('No active AWS profile.')
    }

    const stsClient = new STSClient({
        region: activeProfile.region || 'us-east-1',
        credentials:
            activeProfile.accessKeyId && activeProfile.secretAccessKey
                ? {
                    accessKeyId: activeProfile.accessKeyId,
                    secretAccessKey: activeProfile.secretAccessKey,
                    sessionToken: activeProfile.sessionToken
                }
                : undefined
    })

    const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: sessionName || 's3-client-gui-session',
        ...(mfaSerial && mfaToken
            ? { SerialNumber: mfaSerial, TokenCode: mfaToken }
            : {})
    })

    const response = await stsClient.send(command)

    if (!response.Credentials) {
        throw new Error('STS AssumeRole returned no credentials.')
    }

    return {
        name: `assumed:${roleArn.split('/').pop()}`,
        accessKeyId: response.Credentials.AccessKeyId!,
        secretAccessKey: response.Credentials.SecretAccessKey!,
        sessionToken: response.Credentials.SessionToken!,
        region: activeProfile.region,
        source: 'credentials'
    }
}
