const EventEmitter = require('events');
const db = require('./database.js'); //for logging events
const { v4: uuidv4 } = require('uuid'); 
const DomainEvent = require('./domain-event.js'); 

// --- (Optional) Schema Validation Dependencies ---
// Uncomment these lines to enable schema validation.
// const Ajv = require("ajv");
// const eventSchemas = require("./event-schemas"); 
// const ajv = new Ajv();

/**
 * @class EventBusWrapper
 * @description A decorator for Node's native EventEmitter that enhances it with
 *              guaranteed event persistence, creating a foundational "Event Store".
 *              This class uses the Proxy pattern to intercept the 'emit' method,
 *              persisting events before they are published to consumers.
 *              It performors "double emit": "eager/optimistic emit" and "kafked/logged emit"
 */
class EventBusWrapper {
  constructor(eventEmitterInstance) {
    this.eventBus = eventEmitterInstance;

    // The Proxy intercepts any property access on the EventBusWrapper instance.
    return new Proxy(this, {
      /**
       * The 'get' trap is triggered whenever a property is accessed.
       * @param {EventBusWrapper} target - The original EventBusWrapper instance.
       * @param {string} prop - The name of the property being accessed (e.g., 'on', 'emit').
       */
      get: (target, prop) => {
        // If the property exists on our wrapper (e.g., custom methods or propierties), use it.
        if (prop in target) {
          return target[prop];
        }

        // Otherwise, delegate the call to the original EventEmitter instance.
        const originalMethod = target.eventBus[prop];

        // If it's not a function, just return the property.
        if (typeof originalMethod !== 'function') return originalMethod;          

        // If its not "emit":
        // For any other method (like 'on', 'once', etc.), we need to ensure the `this` context is correct.
        // If the property is a function, we bind it to the original EventEmitter instance.
        if (prop !== 'emit') return originalMethod.bind(target.eventBus);

        // --- Intercept the 'emit' method ---
        if (prop === 'emit') {
          // We return a new function that wraps the original 'emit'.
          // This allows us to inject our validation logic before the event is published.
          return async (event) => {
            
            // TO-DO
            // --- SCHEMA VALIDATION LOGIC --
            // This is where the schema validation would be enforced. It ensures that
            // every event published to the bus conforms to a predefined structure,
            // preventing bugs caused by malformed event data.
            /*
            const validate = eventSchemas[eventType] && ajv.compile(eventSchemas[eventType]);
            if (validate && !validate(eventPayload)) {
              const errorMessage = `Invalid event payload for '${eventType}'. Validation errors: ${ajv.errorsText(validate.errors)}`;
              console.error('[EventBus] Schema validation failed:', errorMessage);
              // In a production environment, you might throw an error or emit a dedicated 'schema-error' event.
              throw new Error(errorMessage);
            }
            */
            try {
              // STEP 0: After validation, we emit the "eager" or "optimistic" event.
              // We directly call the original method on the native EventEmitter
              // to bypass our own proxy and avoid the logging/kafked logic.
              // Consumers who need speed over guarantee can subscribe to this.
              originalMethod.call(target.eventBus, event.type, event);

              // STEP 1: Await persistence to the Event Store. This guarantees the event is logged.
              const { eventId: logId } = await db.logEvent(event);
              console.log(`[Kafky-EventBus] Event '${event.type}' persisted with log ID: ${logId}`);

              // STEP 2: Create a new, derived event name and enrich the payload.
              // The "-KAFKED" suffix is a convention signifying that this event is now
              // immutable, persisted, and safe for consumers to process.
              // Note: consumers preferably should suscribe to "-KAFKED" events
              const kafkedEventName = event.type + '-KAFKED';

              event.metadata.logId = logId; //we add the logId with which the DB has saved it
              event.type = kafkedEventName; //We modify the type of our event because now it's -KAFKED 
              
              // STEP 3: Publish the enriched, guaranteed event.
              // We call the original 'emit' method to avoid an infinite logging loop.
              // Consumers subscribe to the "-KAFKED" version, ensuring they only act
              // on events that have been successfully persisted.
              originalMethod.call(target.eventBus, kafkedEventName, event);
            } catch (error) {
              console.error(`[Kafky-EventBus] CRITICAL: Failed to log and publish event '${event.type}'. Event lost.`, error);
              // ARCHITECTURAL NOTE
              // On Resilient Error Handling (Compensation Sagas):
              // In a distributed system, handling critical failures like this requires a
              // "Compensation" workflow, often orchestrated via a Saga pattern. The goal
              // is to maintain data consistency by undoing previous steps in a business process.

              // The robust flow would be:
              // 1. DEAD-LETTER QUEUE: The failed event is immediately moved to a DLQ for
              //    auditing and potential manual replay by an engineer.

              // 2. FAILURE EVENT CHAIN: The EventBus emits a specific failure event,
              //    e.g., `${eventType}-PERSISTENCE_FAILED`. This event must carry the
              //    `correlationId` that traces back to the original user request.

              // 3. CHOREOGRAPHED ROLLBACK: Services involved in the original process subscribe
              //    to these failure events to perform compensating actions. For example:
              //    - A theoretical 'BillingService' might subscribe to undo a charge, then publish an event "CHARGE_UNDONE" 
              //    - The 'Gateway' service would subscribe to "CHARGE_UNDONE" to know the process failed.
              //      Since the Gateway holds the original client connection context (`ws`),
              //      it would be its responsibility to send a real-time error notification
              //      back to the specific user, telling them to try again.

              // This "chain" of compensating events allows the system to roll back
              // a failed operation in a fully decoupled manner, ensuring each service is
              // only responsible for its own state. 
            };
          }
        }
      }
    });
  }
}

// Create a single, shared instance of the EventEmitter.
const nativeEventEmitter = new EventEmitter();

// Wrap the native instance with our enhanced proxy.
// The rest of the application will interact with this `eventBus` instance,
// benefiting from any enhancements (like validation) transparently.
const eventBus = new EventBusWrapper(nativeEventEmitter);

console.log('[Kafky-EventBus] Kafky Event Bus initialized.');

module.exports = eventBus;