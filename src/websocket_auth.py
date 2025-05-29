import hashlib

def generate_token(password: str, public_key_part: str) -> str:
    """
    Generates a token by hashing the concatenation of a password and a public key part.

    Args:
        password: The password string.
        public_key_part: The public key part string.

    Returns:
        The hex digest of the SHA256 hash of the concatenated string.
        This function is mainly for conceptual demonstration and client-side examples.
        The server will typically store pre-hashed passwords.
    """
    combined_string = password + public_key_part
    hashed_string = hashlib.sha256(combined_string.encode('utf-8')).hexdigest()
    return hashed_string

def is_valid_token(provided_token: str, password_for_key: str, public_key_part_from_client: str) -> bool:
    """
    Validates a provided token by reconstructing and comparing it.

    This is a simpler approach where the server uses the raw password expected for the key
    to reconstruct the token. The server will need to manage how it gets `password_for_key`
    based on `public_key_part_from_client`.

    Args:
        provided_token: The token sent by the client.
        password_for_key: The password associated with the public key part.
        public_key_part_from_client: The public key part sent by the client.

    Returns:
        True if the provided token matches the reconstructed token, False otherwise.
    """
    expected_token = hashlib.sha256((password_for_key + public_key_part_from_client).encode('utf-8')).hexdigest()
    return provided_token == expected_token
