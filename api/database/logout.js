import { clearAuthCookies, setCorsHeaders } from './functions.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    
    clearAuthCookies(res);
    res.status(200).json({ success: true, message: 'Logged out successfully' });
}