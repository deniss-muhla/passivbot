# Passivbot WebSocket API

## 1. Overview

The Passivbot WebSocket API provides a way to interact with a running Passivbot instance in real-time. Its primary purposes are:

*   **Real-time Statistics:** Receive live updates on bot performance, including balance, Unrealized PNL (UPNL), active positions, and open order counts.
*   **Configuration Access:** Securely retrieve the bot's current configuration.

The WebSocket server listens on a configurable host and port. The endpoint will typically look like: `ws://<host>:<port>` (e.g., `ws://localhost:8765`).

## 2. Configuration (Server-Side)

To enable and configure the WebSocket server, you need to add the following parameters to your bot's HJSON configuration file, typically within the `live` section:

*   `websocket_port` (integer): The port number on which the WebSocket server will listen.
    *   Example: `8765`
*   `websocket_password` (string): A secret password that clients will use (in combination with the public key part) to generate an authentication token. This password should be kept secure.
    *   Example: `"your_secret_bot_password"`
*   `websocket_public_key_part` (string): An identifier that the client must send during authentication. The server uses this to identify the expected password. This allows for different clients/keys if the server were to be extended to support multiple pre-configured keys, though the current implementation uses one global `websocket_password` and `websocket_public_key_part` on the server.
    *   Example: `"client_A_key"`

**Example HJSON Snippet:**

```hjson
{
  // ... other live configurations ...
  "live": {
    // ... other live settings ...
    "websocket_port": 8765,
    "websocket_password": "your_secret_bot_password",
    "websocket_public_key_part": "client_A_key",
    // ... other live settings ...
  }
  // ... other configurations ...
}
```

## 3. Authentication

The WebSocket API uses a token-based authentication mechanism to secure the connection.

1.  **Token Generation (Client-Side):**
    The client must generate a SHA256 hash of the concatenation of the `websocket_password` and the `websocket_public_key_part`.
    `(token = SHA256(password + public_key_part))`
    See the JavaScript example below for how to generate this token.

2.  **Authentication Request (Client -> Server):**
    Upon connecting, the client must send an authentication message in JSON format:
    ```json
    {
      "type": "auth",
      "token": "generated_hex_token_string",
      "public_key_part": "client_A_key"
    }
    ```
    *   `token`: The SHA256 hex string generated in the previous step.
    *   `public_key_part`: The `websocket_public_key_part` that was used to generate the token. The server expects this to match its configured `websocket_public_key_part`.

3.  **Authentication Response (Server -> Client):**
    The server will validate the `public_key_part` and then the `token`. It responds with:
    ```json
    {
      "type": "auth_result",
      "success": true, // or false
      "message": "Authentication successful" // or an error message
    }
    ```

Clients that fail authentication will typically be disconnected by the server. Only successfully authenticated clients can send further requests or receive updates.

## 4. API Message Formats (Post-Authentication)

All messages are in JSON format.

### Statistics Update (Server -> Client)

The server periodically broadcasts statistics updates to all authenticated clients. This usually happens when there's a change in the reported statistics.

*   **Message Format:**
    ```json
    {
      "type": "statistics",
      "data": {
        "timestamp": 1678886400000,
        "balance": 10000.50,
        "upnl": 150.75,
        "open_orders_count": 5,
        "active_symbols_count": 2,
        "positions": [
          {
            "symbol": "BTC/USDT:USDT",
            "side": "long",
            "size": 0.1,
            "entry_price": 25000.00
          },
          {
            "symbol": "ETH/USDT:USDT",
            "side": "short",
            "size": 2.0,
            "entry_price": 1800.00
          }
        ]
        // ... other stats may be included ...
      }
    }
    ```
    Key fields in `data`:
    *   `timestamp`: Server timestamp when the stats were generated (milliseconds).
    *   `balance`: Current wallet balance.
    *   `upnl`: Total unrealized profit and loss.
    *   `open_orders_count`: Number of open orders.
    *   `active_symbols_count`: Number of symbols the bot is actively managing.
    *   `positions`: A list of active positions, each with symbol, side, size, and entry price.

### Configuration Request (Client -> Server)

Authenticated clients can request the bot's current configuration.

*   **Message Format:**
    ```json
    {
      "type": "get_config"
    }
    ```

### Configuration Response (Server -> Client)

The server responds with its full configuration (a deep copy).

*   **Message Format:**
    ```json
    {
      "type": "config",
      "data": {
        // The entire bot configuration object (HJSON format parsed into JSON)
        "live": {
          "user": "my_user",
          "exchange": "bybit",
          // ... all other live config parameters ...
          "websocket_port": 8765,
          "websocket_password": "your_secret_bot_password",
          "websocket_public_key_part": "client_A_key"
        },
        "bot": {
          // ... bot parameters ...
        }
        // ... etc ...
      }
    }
    ```

## 5. JavaScript Client Example (Token Generation & Basic Interaction)

This example shows how a JavaScript client can generate the required authentication token and outlines basic WebSocket interaction.

```javascript
// --- JavaScript Client Example ---

// Function to generate the authentication token
// It uses the SubtleCrypto API available in modern browsers (and Node.js >= 15) for SHA256 hashing.
async function generateAuthToken(password, publicKeyPart) {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    console.error('SubtleCrypto API not available. This function requires a secure context (HTTPS) or a modern JS environment.');
    return null;
  }
  if (!password || !publicKeyPart) {
    console.error('Password and publicKeyPart are required.');
    return null;
  }

  const combinedString = password + publicKeyPart;
  const encoder = new TextEncoder();
  const data = encoder.encode(combinedString);

  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    console.error('Error generating token:', error);
    return null;
  }
}

// Example Usage (uncomment and adapt to run):
/*
const ws = new WebSocket("ws://localhost:8765"); // Replace with your server address

ws.onopen = async () => {
  console.log("WebSocket connection opened.");

  // These should match your Passivbot's HJSON configuration
  const password = "your_secret_bot_password"; 
  const publicKeyPart = "client_A_key"; 

  const token = await generateAuthToken(password, publicKeyPart);

  if (token) {
    console.log("Generated token:", token);
    ws.send(JSON.stringify({
      type: "auth",
      token: token,
      public_key_part: publicKeyPart
    }));
  } else {
    console.error("Failed to generate token. Closing connection.");
    ws.close();
  }
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log("Received message:", message);

  if (message.type === "auth_result") {
    if (message.success) {
      console.log("Authentication successful!");
      // Now you can send other requests, e.g., get_config
      // Example: Request configuration after successful authentication
      // ws.send(JSON.stringify({ type: "get_config" }));
    } else {
      console.error("Authentication failed:", message.message);
      ws.close();
    }
  } else if (message.type === "statistics") {
    console.log("Statistics Update:", message.data);
    // Handle statistics updates (e.g., update UI)
  } else if (message.type === "config") {
    console.log("Configuration Received:", message.data);
    // Handle config response
  } else if (message.type === "pong") {
    console.log("Received pong from server."); // For keep-alive
  } else if (message.type === "error") {
    console.error("Server error message:", message.message);
  }
};

ws.onerror = (error) => {
  console.error("WebSocket error:", error);
};

ws.onclose = (event) => {
  console.log("WebSocket connection closed.", event.code, event.reason);
};

// Example: send a ping to keep connection alive or check responsiveness
// setInterval(() => {
//   if (ws.readyState === WebSocket.OPEN) {
//     ws.send(JSON.stringify({ type: "ping" }));
//   }
// }, 30000); 
*/
```

This documentation should provide a good starting point for users wishing to interact with the Passivbot WebSocket API.
