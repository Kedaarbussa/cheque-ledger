import clientPromise from './lib/db.js';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
    // Add CORS headers to allow local frontend to communicate with local API running on different ports if needed
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const client = await clientPromise;
        const db = client.db("cheque_ledger");
        const collection = db.collection("transactions");

        switch (req.method) {
            case 'GET': {
                const { userId } = req.query;
                if (!userId) {
                    res.status(401).json({ error: "Unauthorized" });
                    return;
                }
                const transactions = await collection.find({ userId }).toArray();
                // Map _id to id for frontend compatibility
                const mapped = transactions.map(t => ({ ...t, id: t._id.toString() }));
                res.status(200).json(mapped);
                break;
            }
            case 'POST': {
                const newTxn = req.body;
                // Remove frontend ID if present, let Mongo create _id
                if (newTxn.id) delete newTxn.id;

                const result = await collection.insertOne(newTxn);
                res.status(201).json({ ...newTxn, id: result.insertedId.toString() });
                break;
            }
            case 'PUT': {
                const { id, userId, ...updateData } = req.body;
                if (!userId) {
                    res.status(401).json({ error: "Unauthorized" });
                    return;
                }
                await collection.updateOne(
                    { _id: new ObjectId(id), userId },
                    { $set: updateData }
                );
                res.status(200).json({ success: true, id, userId, ...updateData });
                break;
            }
            case 'DELETE': {
                const { id, userId } = req.query; // If pass via URL: /api/transactions?id=...

                if (id && userId) {
                    await collection.deleteOne({ _id: new ObjectId(id), userId });
                    res.status(200).json({ success: true, deletedId: id });
                } else {
                    res.status(400).json({ error: "Missing ID or User Authentication" });
                }
                break;
            }
            default:
                res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
                res.status(405).end(`Method ${req.method} Not Allowed`);
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
