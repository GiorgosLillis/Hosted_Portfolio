import { serialize } from 'cookie';

export default async function handler(req, res) {
    res.setHeader('Set-Cookie', serialize('token', '', { 
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'strict',
        expires: new Date(0),
        path: '/'
    }));

    res.status(200).json({ success: true, message: 'Logged out successfully' });
}