import { prisma } from '../lib/prisma.js';
import { checkToken, setCorsHeaders, getClientIp, sendStatus } from '../lib/functions.js';
import { enforceRateLimits } from '../lib/http.js';
import { recaptchaMiddleware } from '../lib/recaptcha.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Limits the browser already respects, enforced here too because anyone can call the API directly
const MAX_LIST_ITEMS = 500;
const MAX_NAME_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 50;
const MAX_UNIT_LENGTH = 30;
const MAX_QUANTITY = 1_000;
// Letters of any language, numbers, spaces and the punctuation real products use. Same rule as src/js/common/validation.js.
const ITEM_NAME_CHARACTERS = /^[\p{L}\p{M}\p{N} .,'’&()/%+!?-]+$/u;

function isValidListItem(item: any): boolean {
  if (typeof item !== 'object' || item === null) {
    return false;
  }

  const quantity = typeof item.quantity === 'string' && item.quantity.trim() === '' ? NaN : Number(item.quantity);
  const validName = typeof item.item === 'string' && item.item.trim().length > 0 && item.item.length <= MAX_NAME_LENGTH && ITEM_NAME_CHARACTERS.test(item.item);
  const validCategory = typeof item.category === 'string' && item.category.length > 0 && item.category.length <= MAX_CATEGORY_LENGTH;
  const validUnit = typeof item.unit === 'string' && item.unit.length > 0 && item.unit.length <= MAX_UNIT_LENGTH;
  const validQuantity = Number.isFinite(quantity) && quantity > 0 && quantity <= MAX_QUANTITY;
  const validCheck = item.check === undefined || typeof item.check === 'string' || typeof item.check === 'boolean';
  return validName && validCategory && validUnit && validQuantity && validCheck;
}

async function listHandler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    // Handle preflight request
    return res.status(204).end();
  }

  try {
    // Check user token validation
    const user = await checkToken(req);

    const ip = getClientIp(req);

    // GET for getting user list, POST for creating one, DELETE for deleting list
    // The IP limit sits alongside the per-user one, in case a stolen token gets used to scrape
    if (req.method === 'GET') {
      if (!(await enforceRateLimits(res,
        [`list_get_attempt_ip:${ip}`, 120, 60], // 120 requests per minute per IP
        [`list_get_attempt:${user.id}`, 60, 60] // 60 requests per minute per user
      ))) return;
      await GET(res, user);
    } else if (req.method === 'POST') {
      if (!(await enforceRateLimits(res,
        [`list_post_attempt_ip:${ip}`, 40, 60],  // 40 requests per minute per IP
        [`list_post_attempt:${user.id}`, 20, 60] // 20 requests per minute per user
      ))) return;
      await POST(req, res, user);
    } else if (req.method === 'DELETE') {
      if (!(await enforceRateLimits(res,
        [`list_delete_attempt_ip:${ip}`, 15, 3600], // 15 requests per hour per IP
        [`list_delete_attempt:${user.id}`, 5, 3600] // 5 requests per hour per user
      ))) return;
      await DELETE(res, user);
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'DELETE', 'OPTIONS']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    if ((error as { message?: string }).message === 'Invalid or expired token.' || (error as { message?: string }).message === 'Not authenticated') {
      return sendStatus(res, 401, 'not-authenticated', 'Not authenticated');
    }
    console.error('Server error in list API:', error);
    return sendStatus(res, 500, 'server-error', 'An unexpected error occurred', { error: process.env.NODE_ENV === 'development' ? (error as { message?: string }).message : undefined });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST' || req.method === 'DELETE') {
    return recaptchaMiddleware(req, res, () => listHandler(req, res));
  } else {
    return listHandler(req, res);
  }
}

async function GET(res: VercelResponse, user: any) {
  try {
    // Searching by user id and return list
    const shoppingList = await prisma.userShoppingListItem.findMany({
      where: {
        userId: user.id
      },
      // Items saved together share a timestamp, the id keeps them in the order they were sent
      orderBy: [{ createdAt: 'asc' }, { itemId: 'asc' }],
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

    return sendStatus(res, 200, 'list-fetched', 'Shopping list fetched successfully', { list: shoppingList });

  } catch (error) {
    console.error('Failed to retrieve list:', error);
    return sendStatus(res, 500, 'list-fetch-failed', 'Failed to fetch shopping list');
  }
}

// The saved list replaces the stored one: whatever is in it is added or updated, every other item of the user is deleted
async function POST(req: VercelRequest, res: VercelResponse, user: any) {

  const list = req.body.list;
  if (!list || !Array.isArray(list)) {
    return sendStatus(res, 400, 'invalid-body-array', 'Invalid request body. Expected an array of items.');
  }
  if (list.length > MAX_LIST_ITEMS) {
    return sendStatus(res, 400, 'list-too-large', 'The list is too large.');
  }
  if (!list.every(isValidListItem)) {
    return sendStatus(res, 400, 'list-item-invalid', 'Each item needs a name, category, quantity and unit within the allowed lengths.');
  }
  // One statement can't insert the same (user, name) twice
  const names: string[] = list.map((item) => item.item);
  if (new Set(names).size !== names.length) {
    return sendStatus(res, 400, 'list-duplicate', 'The list contains the same item twice.');
  }

  try {
    // Postgres over Neon's HTTP mode has no transactions, so this is two statements instead of one per item.
    // Upsert first: if the delete then fails, the user has a few extra old items rather than missing ones.
    if (list.length > 0) {
      await prisma.$executeRaw`
        INSERT INTO "user_shopping_list_items" ("user_id", "category", "name", "quantity", "measure", "is_purchased")
        SELECT ${user.id}::int, category, name, quantity, measure, is_purchased
        FROM unnest(
          ${list.map((item) => item.category)}::text[],
          ${names}::text[],
          ${list.map((item) => Number(item.quantity))}::numeric[],
          ${list.map((item) => item.unit)}::text[],
          ${list.map((item) => item.check === true || item.check === 'true')}::boolean[]
        ) WITH ORDINALITY AS incoming(category, name, quantity, measure, is_purchased, position)
        ORDER BY position
        ON CONFLICT ("user_id", "name") DO UPDATE SET
          "category" = EXCLUDED."category",
          "quantity" = EXCLUDED."quantity",
          "measure" = EXCLUDED."measure",
          "is_purchased" = EXCLUDED."is_purchased"`;
    }

    await prisma.userShoppingListItem.deleteMany({
      where: {
        userId: user.id,
        name: { notIn: names },
      },
    });

    return sendStatus(res, 200, 'list-updated', 'List updated successfully.');

  } catch (error) {
    console.error('Saving the shopping list failed:', error);
    return sendStatus(res, 500, 'list-update-failed', 'Failed to update shopping list.', { error: process.env.NODE_ENV === 'development' ? (error as { message?: string }).message : undefined });
  }
}

async function DELETE(res: VercelResponse, user: any) {
  try {
    // Delete list that belongs to this user id
    await prisma.userShoppingListItem.deleteMany({
      where: {
        userId: user.id,
      },
    });

    return sendStatus(res, 200, 'list-deleted', 'Shopping list deleted successfully.');

  } catch (error) {
    console.error('DELETE operation failed:', error);
    return sendStatus(res, 500, 'list-delete-failed', 'Failed to delete shopping list.', { error: process.env.NODE_ENV === 'development' ? (error as { message?: string }).message : undefined });
  }
}