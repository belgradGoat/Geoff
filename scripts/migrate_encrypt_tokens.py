#!/usr/bin/env python3
"""Migration script to encrypt existing GitHub tokens in the database.

Run this once after setting TOKEN_ENCRYPTION_KEY in your .env file.

Usage:
    python scripts/migrate_encrypt_tokens.py

The script will:
1. Find all projects with GitHub tokens
2. Encrypt any unencrypted tokens
3. Update the database with encrypted values
"""

import os
import sys

# Add orchestrator to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'orchestrator', 'src'))

from dotenv import load_dotenv

# Load environment variables
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(env_path)

from supabase import create_client
from orchestrator.core.encryption import encrypt_token, is_encrypted, get_encryption_key


def main():
    # Check encryption key is configured
    if not get_encryption_key():
        print("ERROR: TOKEN_ENCRYPTION_KEY not configured in .env")
        print("Generate one with:")
        print('  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"')
        sys.exit(1)

    # Connect to Supabase
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")

    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        sys.exit(1)

    supabase = create_client(supabase_url, supabase_key)

    # Fetch all projects
    result = supabase.table("projects").select("id, name, settings").execute()

    if not result.data:
        print("No projects found.")
        return

    migrated = 0
    skipped = 0

    for project in result.data:
        project_id = project["id"]
        project_name = project.get("name", project_id)
        settings = project.get("settings") or {}
        github_settings = settings.get("github", {})
        token = github_settings.get("token", "")

        if not token:
            continue

        if is_encrypted(token):
            print(f"  Skipping {project_name}: token already encrypted")
            skipped += 1
            continue

        # Encrypt the token
        encrypted = encrypt_token(token)
        github_settings["token"] = encrypted
        settings["github"] = github_settings

        # Update the database
        supabase.table("projects").update({"settings": settings}).eq("id", project_id).execute()

        print(f"  Encrypted token for: {project_name}")
        migrated += 1

    print()
    print(f"Migration complete: {migrated} tokens encrypted, {skipped} already encrypted")


if __name__ == "__main__":
    print("GitHub Token Encryption Migration")
    print("=" * 40)
    main()
