import {useState, type FormEvent} from 'react';

type Props = {
    kind: 'verify' | 'reset';
    token: string;
    onComplete: () => void;
    onCancel: () => void;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const EmailAction = ({kind, token, onComplete, onCancel}: Props) => {
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/auth/${kind === 'verify' ? 'verify' : 'reset-password'}`, {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({token, ...(kind === 'reset' ? {password} : {})})
            });
            if (!response.ok) throw new Error(`${kind === 'verify' ? 'Verification' : 'Reset'} link is invalid or expired.`);
            onComplete();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Unable to complete request.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="mx-auto mt-16 max-w-sm rounded border border-gray-300 p-6">
            <h1 className="text-xl font-semibold">{kind === 'verify' ? 'Verify email' : 'Reset password'}</h1>
            <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
                {kind === 'reset' ? (
                    <label>New password<input className="mt-1 w-full rounded border p-2" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)}/></label>
                ) : null}
                <button className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" disabled={busy} type="submit">
                    {busy ? 'Please wait...' : kind === 'verify' ? 'Verify email' : 'Update password'}
                </button>
            </form>
            {error ? <p className="mt-3 text-red-700" role="alert">{error}</p> : null}
            <button className="mt-4 text-sm text-blue-700 underline" type="button" onClick={onCancel}>Back to sign in</button>
        </main>
    );
};

export default EmailAction;
