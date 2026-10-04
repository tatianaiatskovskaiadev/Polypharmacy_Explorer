import {useState} from 'react';

type Props = {
    csrfToken: string;
    onRefresh: () => Promise<void>;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const VerifyEmailNotice = ({csrfToken, onRefresh}: Props) => {
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const resend = async () => {
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
                method: 'POST',
                credentials: 'include',
                headers: {'x-csrf-token': csrfToken}
            });
            if (!response.ok) throw new Error('Unable to request verification email.');
            setMessage('Verification email requested. Check your inbox shortly.');
        } catch (resendError) {
            setError(resendError instanceof Error ? resendError.message : 'Unable to request verification email.');
        }
    };

    return (
        <div className="m-6 max-w-xl rounded border border-amber-300 bg-amber-50 p-4 text-sm">
            <p>Verify your email before using the explorer.</p>
            <div className="mt-3 flex gap-3">
                <button className="rounded border px-3 py-2" type="button" onClick={resend}>Resend email</button>
                <button className="rounded border px-3 py-2" type="button" onClick={() => onRefresh().catch(() => setError('Unable to check verification status.'))}>I've verified my email</button>
            </div>
            {message ? <p className="mt-2 text-green-700" role="status">{message}</p> : null}
            {error ? <p className="mt-2 text-red-700" role="alert">{error}</p> : null}
        </div>
    );
};

export default VerifyEmailNotice;
