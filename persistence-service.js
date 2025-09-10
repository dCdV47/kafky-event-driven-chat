// persistence-service.js - Handles storing messages in the database.
const eventBus = require('./event-bus.js');
/**
 * A dedicated service responsible for persisting data.
 * It listens for application events and interacts with the database layer,
 * effectively decoupling database logic from the main gateway.
 */
class PersistenceService {
    /**
     * @param {object} database - The database module/client for data operations.
     */
    constructor(database) {
        this.db = database;
        console.log('[PersistenceService] Persistence service initialized.');
    }

    /**
     * Activates the service by subscribing it to relevant events on the event bus.
     * This should be called once at application startup.
     */
    listen() {
        // Subscribe to the high-level 'incoming-message' event published by the gateway.
        eventBus.on('incoming-message', async (data) => {
            const { chatId, userId, messageText } = data;
            console.log(`[PersistenceService] 'incoming-message' event received. Persisting to database...`);
            
            try {
                // 1. Fulfill the primary responsibility: save the message.
                const newMessage = await this.db.addMessage(chatId, userId, messageText);
                
                // 2. Implement "Event Chaining": After successful persistence, publish a more specific event.
                // This signals that the data is now safely stored and other services (like the dispatcher) can proceed.
                eventBus.emit('message-persisted', newMessage);
                
            } catch (error) {
                console.error('[PersistenceService] Failed to save message:', error);

                // NOTE: A more robust implementation could emit a 'persistence-error' event here,
                // allowing other parts of the system to handle the failure.
                // e.g., this.eventBus.emit('message-error', { error, originalMessage: data });
                // This event would be handle by the Dispatcher and send a warning to the user "message couldn't be delivered, try again"
            }
        });
    }
}

// Export the class to allow for dependency injection.
// The main application file will create the instance and provide the `db`.
module.exports = PersistenceService;