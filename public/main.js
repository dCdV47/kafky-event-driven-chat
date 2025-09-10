// main.js - Client-side logic for the chat application (ViewModel).

document.addEventListener('DOMContentLoaded', () => {

    // --- STATE MANAGEMENT (MODEL) ---
    // The single source of truth for the client-side application state.
    const state = {
        currentUser: null,     // Populated with { id, name } upon user identification.
        currentChat: null,     // Populated with { id, name } upon chat selection.
        messages: [],          // Message list for the currently active chat.
        // NOTE: In a production app, this would be fetched from the server after login.
        availableChats: [
            { id: 1, name: "Chat Manolo-Pepe", participants: [1, 2] },
            { id: 2, name: "Chat Manolo-Luisa", participants: [1, 3] }
        ]
    };

    // --- UI ELEMENT CACHING (VIEW REFERENCES) ---
    // Cache DOM elements for performance and cleaner access.
    const ui = {
        userSelectionPanel: document.getElementById('user-selection-panel'),
        chatSelectionPanel: document.getElementById('chat-selection-panel'),
        chatSelectionTitle: document.getElementById('chat-selection-title'),
        chatListDiv: document.getElementById('chat-list'),
        chatPanel: document.getElementById('chat-panel'),
        chatTitle: document.getElementById('chat-title'),
        messagesDiv: document.getElementById('messages'),
        messageForm: document.getElementById('message-form'),
        messageInput: document.getElementById('message-input')
    };
    
    // --- WEBSOCKET CONNECTION ---
    const ws = new WebSocket(`ws://${window.location.host}`);
    ws.onopen = () => console.log('WebSocket connection established with server.');
    ws.onerror = (error) => console.error('WebSocket error:', error);
    ws.onclose = () => console.log('Disconnected from WebSocket server. Please reload the page.');


    // ================================================================
    // --- CORE LOGIC (VIEWMODEL) ---
    // ================================================================

    // 1. Handle incoming server events
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Server event received:', data);

        // Router for events pushed from the server.
        switch (data.type) {
            case 'chat.history':
                // Server sends the history for a selected chat.
                state.messages = data.payload; // Update state (Model)
                renderMessages();              // Re-render UI (View)
                break;
            
            case 'chat.message.broadcast':
                // Server broadcasts a new message to participants.
                // Ensure the message belongs to the currently active chat before adding it.
                if (state.currentChat && data.payload.id_chat === state.currentChat.id) {
                    state.messages.push(data.payload); // Update state (Model)
                    renderMessages();                  // Re-render UI (View)
                }
                break;
        }
    };

    // 2. Handle user interactions (UI Event Listeners)

    // Event: User identifies themselves.
    ui.userSelectionPanel.addEventListener('click', (e) => {
        // Ignore clicks that are not on a button.
        if (e.target.tagName !== 'BUTTON') return;

        // Update the state with the selected user.
        state.currentUser = {
            id: parseInt(e.target.dataset.userid, 10),
            name: e.target.dataset.username
        };

        // Notify the server of user identification.
        sendEventToServer('user.identify', { userId: state.currentUser.id });

        // Update the UI to transition to the next panel.
        ui.userSelectionPanel.classList.add('hidden');
        renderChatSelection();
        ui.chatSelectionPanel.classList.remove('hidden');
    });

    // Event: User selects a chat.
    ui.chatListDiv.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;

        // Update state with the selected chat details.
        state.currentChat = {
            id: parseInt(e.target.dataset.chatid, 10),
            name: e.target.textContent
        };
        state.messages = []; // Clear messages from the previous chat.

        // Request chat history from the server.
        sendEventToServer('chat.select', { chatId: state.currentChat.id });
        
        // Update UI to display the main chat panel.
        ui.chatSelectionPanel.classList.add('hidden');
        renderChatPanel();
        ui.chatPanel.classList.remove('hidden');
    });

    // Event: User submits a new message.
    ui.messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = ui.messageInput.value.trim();

        if (messageText === '' || !state.currentChat) return;

        // Send the new message event to the server.
        sendEventToServer('chat.message.new', {
            chatId: state.currentChat.id,
            messageText: messageText
        });

        // Clear input for an optimistic UI update.
        ui.messageInput.value = '';
    });

    /**
     * Helper function to send standardized JSON events to the WebSocket server.
     * @param {string} type - The event type (e.g., 'user.identify').
     * @param {object} payload - The data associated with the event.
     */
    function sendEventToServer(type, payload) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, payload }));
        } else {
            console.error('Failed to send event: WebSocket is not open.');
        }
    }

    // ================================================================
    // --- RENDER FUNCTIONS (Update the DOM from State) ---
    // ================================================================

    /**
     * Renders the list of available chats for the currently logged-in user.
     */
    function renderChatSelection() {
        ui.chatSelectionTitle.textContent = `Welcome, ${state.currentUser.name}. Select a chat:`;
        ui.chatListDiv.innerHTML = ''; // Clear the list before re-rendering.

        const userChats = state.availableChats.filter(chat => chat.participants.includes(state.currentUser.id));

        if (userChats.length === 0) {
            ui.chatListDiv.textContent = 'No available chats.';
            return;
        }
        
        // Mock user data for display purposes. In a real app, this would be part of the state.
        const userNames = { 1: 'Manolo', 2: 'Pepe', 3: 'Luisa' };

        userChats.forEach(chat => {
            const otherParticipantId = chat.participants.find(p => p !== state.currentUser.id);
            const otherParticipantName = userNames[otherParticipantId] || 'Unknown';
            
            const button = document.createElement('button');
            button.textContent = `Chat with ${otherParticipantName}`;
            button.dataset.chatid = chat.id;
            ui.chatListDiv.appendChild(button);
        });
    }

    /**
     * Sets the title of the chat panel to reflect the current conversation participants.
     */
    function renderChatPanel() {
        const chatInfo = state.availableChats.find(chat => chat.id === state.currentChat.id);
        if (!chatInfo) return; 

        // Determine the name of the other participant for the chat title.
        const otherParticipantId = chatInfo.participants.find(p => p !== state.currentUser.id);
        const userNames = { 1: 'Manolo', 2: 'Pepe', 3: 'Luisa' };
        const otherParticipantName = userNames[otherParticipantId] || 'Unknown';

        const newTitle = `Chat with ${otherParticipantName}`;
        ui.chatTitle.textContent = newTitle;
        
        renderMessages();
    }

    /**
     * Renders the complete list of messages to the screen based on the current state.
     */
    function renderMessages() {
        if (!state.currentUser) return;

        // Always clear the container before re-rendering to avoid duplication.
        ui.messagesDiv.innerHTML = ''; 

        state.messages.forEach(msg => {
            const messageWrapper = document.createElement('div');
            messageWrapper.classList.add('message');
            
            // Determine message alignment based on the sender.
            messageWrapper.classList.add(msg.id_user === state.currentUser.id ? 'me' : 'other');

            messageWrapper.innerHTML = `
                <div class="message-bubble">
                    <div class="username">${msg.username}</div>
                    <div class="text">${msg.message}</div>
                </div>`;
            ui.messagesDiv.appendChild(messageWrapper);
        });

        // Auto-scroll to the bottom to show the latest message.
        ui.messagesDiv.scrollTop = ui.messagesDiv.scrollHeight;
    }
});