import { checkToken } from './functions.js';

export default async function handler(req, res) {
    try {
        const user = await checkToken(req);

        const userData = {
            id: user.id,
            email: user.email,
            first_name: user.firstName,
            last_name: user.lastName,
            created_at: user.createdAt
        };
        res.status(200).json({ user: userData });
    } catch (error) {
        res.status(401).json({ error: 'Not authenticated' });
    }
}