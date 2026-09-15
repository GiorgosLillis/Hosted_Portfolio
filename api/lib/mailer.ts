import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_ID,
        pass: process.env.EMAIL_PASSWORD,
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
