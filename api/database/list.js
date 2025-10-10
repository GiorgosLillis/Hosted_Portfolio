import { prisma } from '../../lib/prisma.js'; 

// --- 1. The GET Handler (Read) ---
export async function GET(request) {
  // 1. Get User ID (e.g., from session or JWT token)
  const currentUserId = 123; // Replace with actual auth logic

  try {
    const shoppingList = await prisma.userShoppingListItem.findMany({
      where: { 
        user_id: currentUserId 
      },
      // Order by creation date to maintain list order
      orderBy: { 
        created_at: 'asc' 
      },
      // You can also select specific fields if needed
      select: {
        itemId: true, // Primary key part
        name: true,
        quantity: true,
        measure: true,
        is_purchased: true,
        created_at: true,
      }
    });

    return new Response(JSON.stringify(shoppingList), { status: 200 });

  } catch (error) {
    console.error('Failed to retrieve list:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch shopping list' }), { status: 500 });
  }
}

export async function PUT(request) {
  const currentUserId = 123; // Replace with actual auth logic
  const body = await request.json();
  console.log('Request body:', body);
  const newList = body.items; // The entire array from the client

  // Get list of unique IDs in the new array for comparison
  const itemIdsToKeep = newList.map(item => item.itemId);

  try {
    // A single, atomic transaction for data integrity
    await prisma.$transaction([

      // A. DELETION: Remove items that were on the old list but are NOT in the new list
      prisma.userShoppingListItem.deleteMany({
        where: {
          user_id: currentUserId,
          itemId: {
            notIn: itemIdsToKeep, // Delete any item ID that is NOT present in the list sent by the client
          },
        },
      }),

      // B. UPSERTS: Update existing items or Create new ones
      ...newList.map(item => {
        return prisma.userShoppingListItem.upsert({
          where: {
            // Uses the composite primary key defined in migration.sql
            user_id_itemId: { 
              user_id: currentUserId,
              itemId: item.itemId,
            },
          },
          update: {
            // Update fields based on client data
            name: item.name,
            quantity: item.quantity,
            measure: item.measure,
            is_purchased: item.isPurchased,
          },
          create: {
            // Create the record if the user/item combo doesn't exist
            user_id: currentUserId,
            itemId: item.itemId,
            name: item.name,
            quantity: item.quantity,
            measure: item.measure,
            is_purchased: item.isPurchased,
          },
        });
      })
    ]);

    return new Response(JSON.stringify({ message: 'List saved successfully' }), { status: 200 });
    
  } catch (error) {
    console.error('Batch Update Transaction Failed:', error);
    return new Response(JSON.stringify({ error: 'Failed to save list changes' }), { status: 500 });
  }
}