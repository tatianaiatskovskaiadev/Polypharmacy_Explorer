import {useEffect, useState} from 'react';

type ActiveSession = {
    id: string;
    createdAt: string;
    expiresAt: string;
    current: boolean;
};

type Props = {
    csrfToken: string;
    onCurrentRevoked: () => void;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const SessionManager = ({csrfToken, onCurrentRevoked}: Props) => {
    const [open, setOpen] = useState(false);
    const [sessions, setSessions] = useState<ActiveSession[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const abortController = new AbortController();
        fetch(`${API_BASE_URL}/auth/sessions`, {credentials: 'include', signal: abortController.signal})
            .then(async (response) => {
                if (!response.ok) throw new Error('Unable to load sessions.');
                const data = await response.json() as {sessions: ActiveSession[]};
                setSessions(data.sessions);
            })
            .catch(() => {
                if (!abortController.signal.aborted) setError('Unable to load sessions.');
            }).finally(() => {
                if (!abortController.signal.aborted) setLoading(false);
            });
        return () => abortController.abort();
    }, [open]);

    const revoke = async (session: ActiveSession) => {
        setBusyId(session.id);
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/auth/sessions/${session.id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {'x-csrf-token': csrfToken}
            });
            if (!response.ok) throw new Error('Unable to revoke session.');
            if (session.current) onCurrentRevoked();
            else setSessions((previous) => previous.filter((item) => item.id !== session.id));
        } catch {
            setError('Unable to revoke session.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section className="m-6 max-w-xl text-sm">
            <button className="rounded border border-gray-300 px-3 py-2" type="button" onClick={() => {setOpen(!open); setLoading(!open); setError('');}}>
                {open ? 'Hide sessions' : 'Manage sessions'}
            </button>
            {open ? (
                <div className="mt-3 rounded border border-gray-300 p-3">
                    <h2 className="font-semibold">Active sessions</h2>
                    {loading ? <p className="mt-2 text-gray-600">Loading sessions...</p> : null}
                    {!loading && sessions.length === 0 && !error ? <p className="mt-2 text-gray-600">No active sessions found.</p> : null}
                    <ul className="mt-2 space-y-2">
                        {sessions.map((session) => (
                            <li className="flex items-center justify-between gap-3 border-t pt-2" key={session.id}>
                                <span>{session.current ? 'Current session' : 'Other session'} · Started {new Date(session.createdAt).toLocaleString()}</span>
                                <button className="rounded border border-red-300 px-2 py-1 text-red-700 disabled:opacity-50" type="button" disabled={busyId !== null} onClick={() => revoke(session)}>
                                    {busyId === session.id ? 'Revoking...' : 'Revoke'}
                                </button>
                            </li>
                        ))}
                    </ul>
                    {error ? <p className="mt-2 text-red-700" role="alert">{error}</p> : null}
                </div>
            ) : null}
        </section>
    );
};

export default SessionManager;
