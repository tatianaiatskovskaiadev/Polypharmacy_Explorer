import {useEffect, useState, type FormEvent} from 'react';
import {useAppDispatch, useAppSelector} from '../app/hooks.ts';
import {clearSession, setSession, type AuthSession} from '../features/auth/authSlice.ts';
import {drugApi} from '../features/api/drugApi.ts';
import SearchPanel from './SearchPanel.tsx';
import SessionManager from './SessionManager.tsx';
import EmailAction from './EmailAction.tsx';
import VerifyEmailNotice from './VerifyEmailNotice.tsx';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const readEmailAction = () => {
    const url = new URL(window.location.href);
    const verifyToken = url.searchParams.get('verify');
    const resetToken = url.searchParams.get('reset');
    if (!verifyToken && !resetToken) return null;
    return verifyToken ? {kind: 'verify' as const, token: verifyToken} : {kind: 'reset' as const, token: resetToken!};
};

const AuthGate = () => {
    const dispatch = useAppDispatch();
    const session = useAppSelector((state) => state.auth);
    const [emailAction, setEmailAction] = useState(readEmailAction);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [registering, setRegistering] = useState(false);
    const [forgotPassword, setForgotPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [registrationCode, setRegistrationCode] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('verify') && !url.searchParams.has('reset')) return;
        url.searchParams.delete('verify');
        url.searchParams.delete('reset');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }, []);

    const refreshSession = async () => {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {credentials: 'include'});
        if (response.ok) dispatch(setSession(await response.json() as AuthSession));
        else dispatch(clearSession());
    };

    useEffect(() => {
        const abortController = new AbortController();
        fetch(`${API_BASE_URL}/auth/me`, {credentials: 'include', signal: abortController.signal})
            .then(async (response) => {
                if (response.ok) dispatch(setSession(await response.json() as AuthSession));
                else dispatch(clearSession());
            })
            .catch((fetchError: unknown) => {
                if (!abortController.signal.aborted) {
                    setError(fetchError instanceof Error ? fetchError.message : 'Unable to reach the API.');
                }
            })
            .finally(() => {
                if (!abortController.signal.aborted) setLoading(false);
            });
        return () => abortController.abort();
    }, [dispatch]);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/auth/${registering ? 'register' : 'login'}`, {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email, password, ...(registering ? {registrationCode} : {})})
            });
            if (!response.ok) {
                const body = await response.json() as {message?: string};
                throw new Error(body.message ?? 'Unable to sign in.');
            }
            const nextSession = await response.json() as AuthSession;
            dispatch(drugApi.util.resetApiState());
            dispatch(setSession(nextSession));
            setPassword('');
            setRegistrationCode('');
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Unable to sign in.');
        } finally {
            setSubmitting(false);
        }
    };

    const submitForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email})
            });
            if (!response.ok) throw new Error('Unable to request password reset.');
            setNotice('If an account exists, a password reset email has been requested.');
            setForgotPassword(false);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Unable to request password reset.');
        } finally {
            setSubmitting(false);
        }
    };

    const logout = async () => {
        if (!session) return;
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: {'x-csrf-token': session.csrfToken}
            });
            if (!response.ok && response.status !== 401) throw new Error('Unable to sign out.');
            dispatch(clearSession());
            dispatch(drugApi.util.resetApiState());
        } catch (logoutError) {
            setError(logoutError instanceof Error ? logoutError.message : 'Unable to sign out.');
        }
    };

    if (loading) return <p className="m-6">Checking session...</p>;

    if (emailAction) return <EmailAction
        kind={emailAction.kind}
        token={emailAction.token}
        onCancel={() => setEmailAction(null)}
        onComplete={() => {
            if (emailAction.kind === 'reset') {
                dispatch(clearSession());
                dispatch(drugApi.util.resetApiState());
                setNotice('Password updated. Sign in with your new password.');
                setEmailAction(null);
            } else {
                refreshSession()
                    .then(() => {setNotice('Email verified. You can use the explorer.'); setEmailAction(null);})
                    .catch(() => {setError('Email verified, but session refresh failed. Sign in again.'); setEmailAction(null);});
            }
        }}
    />;

    if (session) return (
        <>
            <div className="m-6 flex items-center justify-between gap-3 text-sm">
                <span>Signed in as {session.user.email}</span>
                <button className="rounded border border-gray-300 px-3 py-2" type="button" onClick={logout}>Sign out</button>
            </div>
            {error ? <p className="m-6 text-red-700" role="alert">{error}</p> : null}
            {notice ? <p className="m-6 text-green-700" role="status">{notice}</p> : null}
            {!session.user.emailVerified ? <VerifyEmailNotice csrfToken={session.csrfToken} onRefresh={refreshSession}/> : null}
            <SessionManager csrfToken={session.csrfToken} onCurrentRevoked={() => {
                dispatch(clearSession());
                dispatch(drugApi.util.resetApiState());
            }}/>
            {session.user.emailVerified ? <SearchPanel/> : null}
        </>
    );

    if (forgotPassword) return (
        <main className="mx-auto mt-16 max-w-sm rounded border border-gray-300 p-6">
            <h1 className="text-xl font-semibold">Reset password</h1>
            <form className="mt-4 flex flex-col gap-3" onSubmit={submitForgotPassword}>
                <label>Email<input className="mt-1 w-full rounded border p-2" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></label>
                <button className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" disabled={submitting} type="submit">Send reset email</button>
            </form>
            {error ? <p className="mt-3 text-red-700" role="alert">{error}</p> : null}
            <button className="mt-4 text-sm text-blue-700 underline" type="button" onClick={() => {setForgotPassword(false); setError('');}}>Back to sign in</button>
        </main>
    );

    return (
        <main className="mx-auto mt-16 max-w-sm rounded border border-gray-300 p-6">
            <h1 className="text-xl font-semibold">{registering ? 'Create account' : 'Sign in'}</h1>
            <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
                <label>Email<input className="mt-1 w-full rounded border p-2" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></label>
                <label>Password<input className="mt-1 w-full rounded border p-2" type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 12 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)}/></label>
                {registering ? <label>Invitation code<input className="mt-1 w-full rounded border p-2" type="text" required value={registrationCode} onChange={(event) => setRegistrationCode(event.target.value)}/></label> : null}
                <button className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" disabled={submitting} type="submit">{submitting ? 'Please wait...' : registering ? 'Create account' : 'Sign in'}</button>
            </form>
            {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
            {notice ? <p className="mt-3 text-green-700" role="status">{notice}</p> : null}
            <button className="mt-4 text-sm text-blue-700 underline" type="button" onClick={() => {setRegistering(!registering); setError('');}}>
                {registering ? 'Already have an account? Sign in' : 'Have an invitation code? Create account'}
            </button>
            {!registering ? <button className="mt-3 block text-sm text-blue-700 underline" type="button" onClick={() => {setForgotPassword(true); setError(''); setNotice('');}}>Forgot password?</button> : null}
        </main>
    );
};

export default AuthGate;
