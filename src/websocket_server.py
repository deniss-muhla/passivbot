import asyncio
import json
import logging
import websockets
from websockets.exceptions import ConnectionClosedError, ConnectionClosedOK, ConnectionClosed, InvalidState

from src.websocket_auth import is_valid_token

class WebSocketServer:
    def __init__(self, bot_instance):
        """
        Initializes the WebSocketServer.

        Args:
            bot_instance: The Passivbot instance to access config/stats.
        """
        self.bot_instance = bot_instance
        self.server = None
        self.connected_clients = set()
        self.logger = logging.getLogger(__name__)
        # Auth details will be stored from start()
        self.password_for_key = None
        self.expected_public_key_part = None

    async def start(self, host: str, port: int, password_for_key: str, expected_public_key_part: str):
        """
        Starts the WebSocket server.

        Args:
            host: The host to bind the server to.
            port: The port to bind the server to.
            password_for_key: The password associated with the expected public key part.
            expected_public_key_part: The public key part the server expects from the client.
        """
        self.password_for_key = password_for_key
        self.expected_public_key_part = expected_public_key_part
        
        try:
            self.server = await websockets.serve(self._connection_handler, host, port)
            self.logger.info(f"WebSocket server started on {host}:{port}")
        except Exception as e:
            self.logger.error(f"Failed to start WebSocket server: {e}", exc_info=True)
            raise

    async def stop(self):
        """
        Stops the WebSocket server.
        """
        if self.server:
            self.server.close()
            try:
                await asyncio.wait_for(self.server.wait_closed(), timeout=5.0) # Added timeout
                self.logger.info("WebSocket server stopped.")
            except asyncio.TimeoutError:
                self.logger.warning("Timeout waiting for WebSocket server to close.")
            except Exception as e: # General exception catch
                self.logger.error(f"Error stopping WebSocket server: {e}", exc_info=True)
            finally:
                self.server = None # Ensure server is reset even on error
        else:
            self.logger.info("WebSocket server was not running or already stopped.")

    async def _register_client(self, websocket):
        """
        Registers an authenticated client.
        """
        self.connected_clients.add(websocket)
        self.logger.info(f"Client {websocket.remote_address} registered. Total clients: {len(self.connected_clients)}")

    async def _unregister_client(self, websocket):
        """
        Unregisters a client.
        """
        self.connected_clients.discard(websocket) # Use discard to prevent KeyError if already removed
        self.logger.info(f"Client {websocket.remote_address} unregistered. Total clients: {len(self.connected_clients)}")

    async def broadcast(self, message: dict):
        """
        Broadcasts a message to all connected authenticated clients.

        Args:
            message: A dictionary representing the message to send.
        """
        if not self.connected_clients:
            # self.logger.debug("No connected clients to broadcast to.") # Can be noisy
            return

        json_message = json.dumps(message)
        
        # Create send tasks
        send_tasks = [client.send(json_message) for client in self.connected_clients]
        
        if send_tasks:
            # Using asyncio.wait as per requirement.
            # For asyncio.wait, it's typical to handle exceptions by checking task results.
            done, pending = await asyncio.wait(send_tasks, return_when=asyncio.ALL_COMPLETED)
            
            for task in done:
                try:
                    task.result()  # This will raise an exception if the task failed
                except ConnectionClosed: # Specific exceptions related to websocket send
                    self.logger.warning(f"Broadcast failed for a client: Connection closed during send.")
                    # Finding the specific client that failed with asyncio.wait is complex
                    # as tasks don't directly reference clients here.
                    # Consider unregistering clients that fail here if possible, though it's harder than with gather.
                except InvalidState:
                     self.logger.warning(f"Broadcast failed for a client: Invalid state, connection likely closing.")
                except Exception as e:
                    self.logger.error(f"Broadcast failed for a client with an unexpected error: {e}", exc_info=False)
            
            if pending: # Should not happen with ALL_COMPLETED but good for safety
                for task in pending:
                    task.cancel() # Cancel any tasks that didn't complete (should be none)
                    self.logger.warning("Cancelled a pending broadcast task.")


    async def _connection_handler(self, websocket, path: str):
        """
        Handles new client connections, authentication, and message processing.
        """
        client_addr = websocket.remote_address
        self.logger.info(f"New connection attempt from {client_addr} on path '{path}'")
        authenticated = False

        # Authentication Phase
        try:
            auth_message_str = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            auth_data = json.loads(auth_message_str)

            if not isinstance(auth_data, dict): # Ensure auth_data is a dict
                raise ValueError("Auth data must be a JSON object.")

            token = auth_data.get("token")
            public_key_part_from_client = auth_data.get("public_key_part")
            msg_type = auth_data.get("type")

            if not (msg_type == "auth" and token and public_key_part_from_client):
                self.logger.warning(f"Auth failed for {client_addr}: Invalid auth message format or missing fields. Type: {msg_type}, Token: {'present' if token else 'missing'}, PKP: {'present' if public_key_part_from_client else 'missing'}")
                await websocket.send(json.dumps({"type": "auth_result", "success": False, "message": "Authentication failed: Invalid message format"}))
                await websocket.close()
                return

            # Check if the provided public_key_part matches the expected one
            if public_key_part_from_client != self.expected_public_key_part:
                self.logger.warning(f"Auth failed for {client_addr}: Mismatched public_key_part. Expected '{self.expected_public_key_part}', got '{public_key_part_from_client}'")
                await websocket.send(json.dumps({"type": "auth_result", "success": False, "message": "Authentication failed: Invalid public key part"}))
                await websocket.close()
                return

            # Validate the token using the (simplified) password and the client's public key part
            if is_valid_token(token, self.password_for_key, public_key_part_from_client):
                self.logger.info(f"Authentication successful for {client_addr}")
                await websocket.send(json.dumps({"type": "auth_result", "success": True}))
                await self._register_client(websocket)
                authenticated = True
            else:
                self.logger.warning(f"Authentication failed for {client_addr}: Invalid token for public_key_part '{public_key_part_from_client}'")
                await websocket.send(json.dumps({"type": "auth_result", "success": False, "message": "Authentication failed: Invalid token"}))
                await websocket.close()
                return

        except asyncio.TimeoutError:
            self.logger.warning(f"Authentication timeout for {client_addr}")
            if not websocket.closed: await websocket.close(code=1008, reason="Authentication timed out")
            return
        except json.JSONDecodeError:
            self.logger.warning(f"Invalid JSON received during auth from {client_addr}")
            if not websocket.closed: await websocket.send(json.dumps({"type": "auth_result", "success": False, "message": "Authentication failed: Invalid JSON format"}))
            if not websocket.closed: await websocket.close()
            return
        except ValueError as e: # Custom validation errors (e.g. auth_data not a dict)
            self.logger.warning(f"Auth validation error for {client_addr}: {e}")
            if not websocket.closed: await websocket.send(json.dumps({"type": "auth_result", "success": False, "message": f"Authentication failed: {e}"}))
            if not websocket.closed: await websocket.close()
            return
        except (ConnectionClosed, ConnectionClosedError, ConnectionClosedOK) as e:
            self.logger.info(f"Connection closed by {client_addr} during authentication phase: {type(e).__name__}")
            return 
        except Exception as e:
            self.logger.error(f"Unexpected error during authentication for {client_addr}: {e}", exc_info=True)
            try:
                if not websocket.closed: await websocket.send(json.dumps({"type": "auth_result", "success": False, "message": "Authentication failed: Server error"}))
            except Exception as send_e:
                self.logger.error(f"Failed to send auth error response to {client_addr}: {send_e}", exc_info=True)
            if not websocket.closed: await websocket.close()
            return

        # Message Handling Loop (only if authentication was successful)
        if authenticated:
            try:
                async for message_str in websocket:
                    try:
                        message_data = json.loads(message_str)
                        if not isinstance(message_data, dict):
                            self.logger.warning(f"Received non-dict message from {client_addr}: {message_data}")
                            await websocket.send(json.dumps({"type": "error", "message": "Invalid message format: Expected a JSON object."}))
                            continue

                        msg_type = message_data.get('type')
                        self.logger.debug(f"Received message type '{msg_type}' from {client_addr}")

                        if msg_type == 'get_config':
                            self.logger.info(f"Processing 'get_config' request from {client_addr}")
                            if hasattr(self.bot_instance, 'ws_get_config') and callable(self.bot_instance.ws_get_config):
                                config = await self.bot_instance.ws_get_config() # Assume this is an async method
                                await websocket.send(json.dumps({"type": "config", "data": config}))
                            else:
                                self.logger.error("'ws_get_config' method not found on bot_instance or not callable.")
                                await websocket.send(json.dumps({"type": "error", "message": "Server error: Cannot retrieve configuration."}))
                        
                        elif msg_type == 'ping':
                            await websocket.send(json.dumps({"type": "pong"}))
                            self.logger.debug(f"Responded to ping from {client_addr}")

                        else:
                            self.logger.info(f"Received unknown message type '{msg_type}' from {client_addr}: {message_data}")
                            await websocket.send(json.dumps({"type": "error", "message": f"Unknown message type: {msg_type}"}))

                    except json.JSONDecodeError:
                        self.logger.warning(f"Invalid JSON received from {client_addr}: {message_str}")
                        await websocket.send(json.dumps({"type": "error", "message": "Invalid JSON format"}))
                    except (ConnectionClosed, ConnectionClosedError, ConnectionClosedOK):
                        self.logger.info(f"Client {client_addr} disconnected while processing message.")
                        break 
                    except Exception as e:
                        self.logger.error(f"Error processing message from {client_addr}: {e}", exc_info=True)
                        try:
                            await websocket.send(json.dumps({"type": "error", "message": "Error processing your request"}))
                        except Exception as send_e:
                            self.logger.error(f"Failed to send processing error response to {client_addr}: {send_e}", exc_info=True)
            
            except (ConnectionClosed, ConnectionClosedError, ConnectionClosedOK) as e:
                self.logger.info(f"Connection with {client_addr} closed: {type(e).__name__} - {e}")
            except Exception as e:
                self.logger.error(f"Unexpected error in connection handler for {client_addr} (outer loop): {e}", exc_info=True)
            finally:
                await self._unregister_client(websocket)
                # Ensure the websocket is closed from the server side if not already.
                if not websocket.closed:
                    await websocket.close()
                self.logger.info(f"Finished handling connection for {client_addr}. Socket closed state: {websocket.closed}")
        else:
            # This case should ideally not be reached if auth fails, as it should return early.
            # But as a safeguard:
            self.logger.debug(f"Connection handler for {client_addr} ending; client not authenticated.")
            if not websocket.closed:
                 await websocket.close(code=1008, reason="Not authenticated")
