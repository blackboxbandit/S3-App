import { useState } from 'react'

const AWS_REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1', 'eu-south-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
    'ap-south-1', 'ap-east-1',
    'sa-east-1',
    'ca-central-1',
    'me-south-1',
    'af-south-1',
    'us-gov-west-1', 'us-gov-east-1',
    'cn-north-1', 'cn-northwest-1'
]

interface Props {
    onClose: () => void
    onCreated: () => void
}

export default function CreateBucketDialog({ onClose, onCreated }: Props) {
    const [name, setName] = useState('')
    const [region, setRegion] = useState('us-east-1')
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleCreate = async () => {
        if (!name.trim()) return
        try {
            setCreating(true)
            setError(null)
            await window.api.createBucket(name.trim(), region)
            onCreated()
        } catch (err: any) {
            setError(err.message || 'Failed to create bucket')
        } finally {
            setCreating(false)
        }
    }

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <div className="modal__title">Create Bucket</div>

                <div className="modal__field">
                    <label className="modal__label">Bucket Name</label>
                    <input
                        className="modal__input"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="my-bucket-name"
                        autoFocus
                    />
                </div>

                <div className="modal__field">
                    <label className="modal__label">Region</label>
                    <select
                        className="modal__input"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        style={{ cursor: 'pointer' }}
                    >
                        {AWS_REGIONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>

                {error && (
                    <div style={{ color: 'var(--accent-danger)', fontSize: 12, marginBottom: 12 }}>
                        {error}
                    </div>
                )}

                <div className="modal__actions">
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button
                        className="btn btn--primary"
                        onClick={handleCreate}
                        disabled={creating || !name.trim()}
                    >
                        {creating ? 'Creating…' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    )
}
