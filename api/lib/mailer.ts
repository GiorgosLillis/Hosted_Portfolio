import nodemailer from 'nodemailer';

// Brevo's SMTP relay: sends as MAIL_FROM on giorgoslillis.com, which is DKIM-signed through the domain's brevo1/brevo2 records
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
        user: process.env.BREVO_SMTP_LOGIN,
        pass: process.env.BREVO_SMTP_KEY,
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000
});

export { transporter };

interface SendEmailOptions {
    from: string;
    to: string;
    subject: string;
    message: string;
}

export async function sendEmail({ from, to, subject, message }: SendEmailOptions) {
    return transporter.sendMail({ from, to, subject, html: message });
}
