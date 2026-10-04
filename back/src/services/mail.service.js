import nodemailer from 'nodemailer';
import config from '../configuration/config.js';
import {ExternalServiceError} from '../utils/errors.js';

let transporter;

const getTransporter = () => {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: config.mail.host,
            port: config.mail.port,
            secure: config.mail.port === 465,
            requireTLS: config.mail.port !== 465,
            auth: config.mail.user ? {user: config.mail.user, pass: config.mail.password} : undefined
        });
    }
    return transporter;
};

export const sendActionEmail = async (email, purpose, token) => {
    const url = new URL('/', config.appUrl);
    url.searchParams.set(purpose === 'verify-email' ? 'verify' : 'reset', token);
    if (config.mail.mode === 'console') {
        if (config.nodeEnv === 'production') throw new Error('Console mail delivery is disabled in production');
        console.log(`Development ${purpose} link for ${email}: ${url}`);
        return;
    }
    const subject = purpose === 'verify-email' ? 'Verify your Polypharmacy Explorer email' : 'Reset your Polypharmacy Explorer password';
    try {
        await getTransporter().sendMail({
            from: config.mail.from,
            to: email,
            subject,
            text: `${subject}\n\nOpen this link: ${url}\n\nIf you did not request this, you can ignore this email.`
        });
    } catch {
        throw new ExternalServiceError('Email delivery unavailable');
    }
};
