import { prisma } from '../../lib/prisma.js';
import { checkToken, setCorsHeaders } from './functions.js';
import { rateLimiter } from '../../lib/rateLimiter.js';
import { recaptchaMiddleware } from '../recaptcha.js';

async function citiesHandler(req, res) {
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
        const userKey = `cities_post_attempt:${user.id}`;
        const { allowed, ttl } = await rateLimiter(userKey, 20, 60); // 20 requests per minute

        if (!allowed) {
            res.setHeader('Retry-After', ttl);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please try again in ${ttl} seconds.`
            });
        }
      await POST(req, res, user);
    } else {
      res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
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
    if (req.method === 'POST') {
        recaptchaMiddleware(req, res, () => citiesHandler(req, res));
    } else {
        citiesHandler(req, res);
    }
}

// --- 1. The GET Handler (Read) ---
async function GET(req, res, user) {
  
  try {
    const citiesList = await prisma.City.findMany({
      where: {
        userId: user.id
      },
      select: {
        id: true,
        name: true,
        country: true,
        latitude: true,
        longitude: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'City list fetched successfully',
      list: citiesList
    });

  } catch (error) {
    console.error('Failed to retrieve list:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch city list'
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

  // Validate each city object in the list
  for (const city of list) {
      if (typeof city !== 'object' || city === null) {
          return res.status(400).json({ success: false, message: 'Each item in the list must be a valid city object.' });
      }
      if (typeof city.name !== 'string' || city.name.trim() === '') {
          return res.status(400).json({ success: false, message: 'City name is required and must be a non-empty string.' });
      }
      if (typeof city.country !== 'string' || city.country.trim() === '') {
          return res.status(400).json({ success: false, message: 'City country is required and must be a non-empty string.' });
      }
      if (typeof city.latitude !== 'number' || city.latitude < -90 || city.latitude > 90) {
          return res.status(400).json({ success: false, message: 'City latitude is required and must be a number between -90 and 90.' });
      }
      if (typeof city.longitude !== 'number' || city.longitude < -180 || city.longitude > 180) {
          return res.status(400).json({ success: false, message: 'City longitude is required and must be a number between -180 and 180.' });
      }
  }

  const cityIdentifiersToKeep = list.map(city => ({
    name: city.name,
    country: city.country
  }));

  try {
    await prisma.$transaction([
      prisma.City.deleteMany({
        where: {
          userId: user.id,
          NOT: cityIdentifiersToKeep.map(city => ({
            name: city.name,
            country: city.country
          }))
        },
      }),
      ...list.map(city => {
        return prisma.City.upsert({
          where: {
            name_country_userId: {
              name: city.name,
              country: city.country,
              userId: user.id
            }
          },
          update: {
            latitude: city.latitude,
            longitude: city.longitude
          },
          create: {
            userId: user.id,
            name: city.name,
            country: city.country,
            latitude: city.latitude,
            longitude: city.longitude
          },
        });
      })
    ]);

    return res.status(200).json({
      success: true,
      message: 'City list updated successfully.'
    });

  } catch (error) {
    console.error('Batch Update Transaction Failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update city list.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}