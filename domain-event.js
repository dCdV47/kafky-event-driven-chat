const { v4: uuidv4 } = require('uuid');

/**
 * @class DomainEvent
 * @description Represents an immutable fact that has occurred in the system.
 * It is the fundamental unit of communication in an event-driven architecture.
 */
class DomainEvent {
    /**
     * @param {string} type - The name of the event (e.g., 'incoming-message').
     * @param {object} payload - The event-specific data.
     * @param {object} [metadata={}] - Optional metadata for traceability.
     * @param {string} [metadata.correlationId] - ID used to group all events of the same user interaction.
     * @param {string} [metadata.causationId] - ID of the event that caused the creation of this event.
     */
    constructor(type, payload, metadata = {}) {
        /**
         * @property {string} eventId - A globally unique identifier for this event instance.
         * Generated at the time of creation.
         */
        this.eventId = uuidv4();

        /**
         * @property {string} type - The type of the event.
         */
        this.type = type;

        /**
         * @property {object} payload - The event's data payload.
         */
        this.payload = payload;

        /**
         * @property {object} metadata - Contains traceability and context information.
         */
        this.metadata = {
            /**
             * @property {string} timestamp - The ISO 8601 date and time when the event was created.
             */
            timestamp: new Date().toISOString(),
            
            /**
             * @property {string|null} correlationId - Groups a chain of events. Inherited from the causing event.
             */
            correlationId: metadata.correlationId || null,
            
            /**
             * @property {string|null} causationId - Points to the eventId of the event that caused this one.
             */
            causationId: metadata.causationId || null
        };
    }
}

module.exports = DomainEvent;
