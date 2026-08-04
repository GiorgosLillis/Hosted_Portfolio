import { prisma } from '../lib/prisma.js';
import { checkToken, setCorsHeaders, getClientIp } from '../lib/functions.js';
import { rateLimiter } from '../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';

async function listHandler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    // Handle preflight request
    return res.status(204).end();
  }

  try {
    // Check user token validation
    const user = await checkToken(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const ip = getClientIp(req);

    // GET for getting user list, POST for creating one, DELETE for deleting list
    if (req.method === 'GET') {
      // Defense-in-depth: IP limit alongside the per-user one, in case a stolen token gets used to scrape
      const ipCheck = await rateLimiter(`list_get_attempt_ip:${ip}`, 120, 60); // 120 requests per minute per IP
      if (!ipCheck.allowed) {
        res.setHeader('Retry-After', ipCheck.ttl);
        return res.status(429).json({ success: false, message: `Too many requests. Please try again in ${ipCheck.ttl} seconds.` });
      }
      const { allowed, ttl } = await rateLimiter(`list_get_attempt:${user.id}`, 60, 60); // 60 requests per minute
      if (!allowed) {
        res.setHeader('Retry-After', ttl);
        return res.status(429).json({ success: false, message: `Too many requests. Please try again in ${ttl} seconds.` });
      }
      await GET(req, res, user);
    } else if (req.method === 'POST') {
      const ipCheck = await rateLimiter(`list_post_attempt_ip:${ip}`, 40, 60); // 40 requests per minute per IP
      if (!ipCheck.allowed) {
        res.setHeader('Retry-After', ipCheck.ttl);
        return res.status(429).json({ success: false, message: `Too many requests. Please try again in ${ipCheck.ttl} seconds.` });
      }
      // Rate limiting keyed on user id
      const userKey = `list_post_attempt:${user.id}`;
      const { allowed, ttl } = await rateLimiter(userKey, 20, 60); // 20 requests per minute

      if (!allowed) {
        res.setHeader('Retry-After', ttl);
        return res.status(429).json({
          success: false,
          message: `Too many requests. Please try again in ${ttl} seconds.`
        });
      }
      await POST(req, res, user);
    } else if (req.method === 'DELETE') {
      const ipCheck = await rateLimiter(`list_delete_attempt_ip:${ip}`, 15, 3600); // 15 requests per hour per IP
      if (!ipCheck.allowed) {
        res.setHeader('Retry-After', ipCheck.ttl);
        return res.status(429).json({ success: false, message: `Too many delete requests. Please try again in ${ipCheck.ttl} seconds.` });
      }
      const { allowed, ttl } = await rateLimiter(`list_delete_attempt:${user.id}`, 5, 3600); // 5 requests per hour
      if (!allowed) {
        res.setHeader('Retry-After', ttl);
        return res.status(429).json({ success: false, message: `Too many delete requests. Please try again in ${ttl} seconds.` });
      }
      await DELETE(req, res, user);
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'DELETE', 'OPTIONS']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    if (error.message === 'Invalid or expired token.' || error.message === 'Not authenticated') {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    console.error('Server error in list API:', error);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export default async function handler(req, res) {
  if (req.method === 'POST' || req.method === 'DELETE') {
    return recaptchaMiddleware(req, res, () => listHandler(req, res));
  } else {
    return listHandler(req, res);
  }
}

async function GET(req, res, user) {
  try {
    // Searching by user id and return list
    const shoppingList = await prisma.userShoppingListItem.findMany({
      where: {
        userId: user.id
      },
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        itemId: true,
        category: true,
        name: true,
        quantity: true,
        measure: true,
        isPurchased: true,
        createdAt: true,
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Shopping list fetched successfully',
      list: shoppingList
    });

  } catch (error) {
    console.error('Failed to retrieve list:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch shopping list'
    });
  }
}

async function POST(req, res, user) {

  // Check if the list exists and if the fields are in valid format
  const list = req.body.list;
  if (!list || !Array.isArray(list)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid request body. Expected an array of items.'
    });
  }

  // Only delete items the client explicitly removed
  const removed = req.body.removed || [];
  if (!Array.isArray(removed)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid request body. "removed" must be an array.'
    });
  }

  try {
    if (removed.length > 0) {
      await prisma.userShoppingListItem.deleteMany({
        where: {
          userId: user.id,
          name: {
            in: removed,
          },
        },
      });
    }

    // Store the items
    const upsertPromises = list.map(item => {
      return prisma.userShoppingListItem.upsert({
        where: {
          userId_name: {
            userId: user.id,
            name: item.item
          },
        },
        update: {
          category: item.category,
          name: item.item,
          quantity: item.quantity,
          measure: item.unit,
          isPurchased: (item.check === 'true')
        },
        create: {
          userId: user.id,
          category: item.category,
          name: item.item,
          quantity: item.quantity,
          measure: item.unit,
          isPurchased: (item.check === 'true'),
          createdAt: new Date()
        },
      });
    });

    await Promise.all(upsertPromises);

    return res.status(200).json({
      success: true,
      message: 'List updated successfully.'
    });

  } catch (error) {
    console.error('Batch Update Transaction Failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update shopping list.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

async function DELETE(_req, res, user) {
  try {
    // Delete list that belongs to this user id
    await prisma.userShoppingListItem.deleteMany({
      where: {
        userId: user.id,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Shopping list deleted successfully.'
    });

  } catch (error) {
    console.error('DELETE operation failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete shopping list.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}