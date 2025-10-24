import { prisma } from '../../lib/prisma.js';
import { checkToken, setCorsHeaders } from './functions.js';
import { rateLimiter } from '../../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../recaptcha.js';

async function listHandler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    // Handle preflight request
    return res.status(204).end();
  }

  try {
    const user = await checkToken(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    if (req.method === 'GET') {
      await GET(req, res, user);
    } else if (req.method === 'POST') {
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
        recaptchaMiddleware(req, res, () => listHandler(req, res));
    } else {
        listHandler(req, res);
    }
}

// --- 1. The GET Handler (Read) ---
async function GET(req, res, user) {
  try {
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

// --- 2. The POST Handler (Update/Create) ---
async function POST(req, res, user) {
  const list = req.body.list;
  if (!list || !Array.isArray(list)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid request body. Expected an array of items.'
    });
  }

  const itemNamesToKeep = list.map(item => item.item);

  try {
    await prisma.$transaction([
      prisma.userShoppingListItem.deleteMany({
        where: {
          userId: user.id,
          name: {
            notIn: itemNamesToKeep,
          },
        },
      }),
      ...list.map(item => {
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
      })
    ]);

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

// --- 3. The DELETE Handler ---
async function DELETE(_req, res, user) {
  try {
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