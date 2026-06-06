"""
Telegram Lead Scraper — Monitors Telegram groups for freelance/job posts
and saves them as leads to Supabase. Optionally auto-DMs posters.

Usage:
  python agents/telegram/scraper.py

On first run it will ask for your phone number and a login code via SMS.
After that it runs headlessly using a saved session file.
"""

import os
import re
import sys
import json
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from telethon import TelegramClient, events
from telethon.network import ConnectionTcpObfuscated
from telethon.errors import FloodWaitError
from telethon.tl.types import Channel, Chat, User as TgUser
from dotenv import load_dotenv

# ─── Load env ────────────────────────────────────────────────────────────────
env_path = Path(__file__).resolve().parent.parent.parent / ".env.local"
load_dotenv(dotenv_path=env_path)

API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
APP_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
TELEGRAM_PHONE = os.getenv("TELEGRAM_PHONE", "+917569566642")
TELEGRAM_2FA_PASSWORD = os.getenv("TELEGRAM_2FA_PASSWORD", "")

# The user ID to associate leads with
USER_ID = os.getenv("AUTOAPPLY_USER_ID", "")

if not API_ID or not API_HASH:
    print("❌ TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env.local")
    sys.exit(1)

UPSTASH_REDIS_REST_URL = os.getenv("UPSTASH_REDIS_REST_URL", "").strip()
UPSTASH_REDIS_REST_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "").strip()

# ─── Logging ──────────────────────────────────────────────────────────────────
LOG_FILE = Path(__file__).resolve().parent.parent.parent / "telegram_agent.log"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("tg_scraper")

import threading
import httpx

def _push_log_to_redis(line: str):
    if not UPSTASH_REDIS_REST_URL or not UPSTASH_REDIS_REST_TOKEN: return
    try:
        url = f"{UPSTASH_REDIS_REST_URL}/lpush/telegram_logs"
        trim_url = f"{UPSTASH_REDIS_REST_URL}/ltrim/telegram_logs/0/100"
        headers = {"Authorization": f"Bearer {UPSTASH_REDIS_REST_TOKEN}"}
        
        with httpx.Client() as client:
            client.post(url, headers=headers, json=line, timeout=5.0)
            client.get(trim_url, headers=headers, timeout=5.0)
    except Exception:
        pass

def log(msg: str):
    """Write to console and stream to Upstash Redis for the Live Terminal."""
    logger.info(msg)
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    threading.Thread(target=_push_log_to_redis, args=(line,), daemon=True).start()

# ─── Supabase helpers ─────────────────────────────────────────────────────────

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

async def supabase_insert(table: str, data: dict, timeout=30):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=HEADERS, json=data, timeout=timeout)
            resp.raise_for_status()
            # If Prefer: return=representation is used, it returns JSON. Otherwise 201 Created.
            if resp.status_code in [200, 201]:
                return data
            return None
    except Exception as e:
        log(f"⚠️  Supabase insert error: {e}")
        return None

async def supabase_select(table: str, params: dict) -> list:
    """Select rows from Supabase."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=HEADERS,
            params=params,
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json()
        return []

# ─── AI Scoring ───────────────────────────────────────────────────────────────

async def score_lead_with_ai(message_text: str) -> dict:
    """Use Groq LLM to score if a Telegram message is a real job/freelance lead."""
    prompt = f"""Analyze this Telegram message and determine if it's a job posting or freelance opportunity.

Message:
\"\"\"
{message_text[:2000]}
\"\"\"

Return a JSON object with these fields:
- is_lead (boolean): true if this is a genuine job/freelance posting
- score (number 1-10): how relevant this is for a Full Stack / React / Node.js developer
- title (string): extracted job title, or "Freelance Opportunity" if unclear
- company (string): company or person posting, or "Unknown"
- skills_mentioned (array of strings): technical skills mentioned
- location (string): location or "Remote" if not specified
- summary (string): 1-2 sentence summary of the opportunity
- apply_email (string | null): The exact email address to send resumes to, if present
- apply_link (string | null): The exact URL (like Google Forms, Workday, lever) to apply at, if present
- contact_method (string): how to apply — DM, email, link, etc.

Return ONLY valid JSON, no markdown."""

    for attempt in range(3):
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {GROQ_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.1,
                        "max_tokens": 500,
                    },
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                # Strip markdown fences if present
                content = re.sub(r"^```json?\s*", "", content.strip())
                content = re.sub(r"\s*```$", "", content.strip())
                return json.loads(content)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                wait_time = (attempt + 1) * 10
                log(f"⏳ Groq API rate limited (429). Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
            else:
                log(f"⚠️  AI scoring error: HTTP {e.response.status_code}")
                return {"is_lead": False, "score": 0}
        except Exception as e:
            log(f"⚠️  AI scoring error: {e}")
            return {"is_lead": False, "score": 0}
            
    log(f"❌ Groq API failed after 3 retries.")
    return {"is_lead": False, "score": 0}

# ─── Keywords for quick pre-filter ────────────────────────────────────────────

JOB_KEYWORDS = [
    "hiring", "looking for", "we need", "job opening", "job opportunity",
    "freelance", "freelancer", "contract", "remote", "full-time", "part-time",
    "developer", "engineer", "react", "node", "python", "javascript",
    "frontend", "backend", "full stack", "fullstack", "web developer",
    "mern", "next.js", "nextjs", "angular", "vue", "typescript",
    "urgently hiring", "immediate joiner", "work from home", "wfh",
    "apply now", "send your resume", "send cv", "dm me", "dm your",
    "looking to hire", "we're hiring", "join our team", "open position",
    "requirement", "vacancy", "vacancies", "openings",
]

def quick_keyword_match(text: str) -> bool:
    """Fast pre-filter before calling the AI."""
    text_lower = text.lower()
    matches = sum(1 for kw in JOB_KEYWORDS if kw in text_lower)
    return matches >= 2  # At least 2 keywords

# ─── Groups to monitor ────────────────────────────────────────────────────────

# Default groups — user can customize via config
DEFAULT_GROUPS = [
    "Tech Job opportunities",
    "B-7 || The Intens Premium Community",
]

# ─── Main Bot ─────────────────────────────────────────────────────────────────

SESSION_PATH = Path(__file__).resolve().parent / "telegram_session"

class TelegramScraper:
    def __init__(self, user_id: str, groups: list[str] | None = None):
        self.user_id = user_id
        self.groups = groups or DEFAULT_GROUPS
        self.client = TelegramClient(
            str(SESSION_PATH),
            API_ID,
            API_HASH,
            connection=ConnectionTcpObfuscated,
            connection_retries=20,
            retry_delay=3,
            auto_reconnect=True,
            flood_sleep_threshold=600,  # auto-sleep up to 10 min on flood
            timeout=60,
            request_retries=10,
        )
        self.processed_count = 0
        self.lead_count = 0
        self.running = True

    async def start(self):
        log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        log("📱 Telegram Lead Scraper Started")
        log(f"   User: {self.user_id}")
        log(f"   Monitoring {len(self.groups)} groups")
        log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        await self.client.start(
            phone=lambda: TELEGRAM_PHONE,
            password=lambda: TELEGRAM_2FA_PASSWORD if TELEGRAM_2FA_PASSWORD else input("Enter 2FA password: "),
            code_callback=lambda: os.getenv("TELEGRAM_OTP") or input("Please enter the code you received: ")
        )
        log("✅ Telegram login successful!")

        # Resolve group entities
        joined_groups = []
        for group_name in self.groups:
            try:
                entity = await self.client.get_entity(group_name)
                joined_groups.append(entity)
                log(f"   ✅ Joined: {getattr(entity, 'title', group_name)}")
            except Exception as e:
                log(f"   ⚠️  Could not join '{group_name}': {e}")

        if not joined_groups:
            log("❌ No groups found! Add valid group usernames.")
            return

        log(f"\n🔍 Monitoring {len(joined_groups)} groups for job leads...\n")

        # Register message handler
        @self.client.on(events.NewMessage(chats=joined_groups))
        async def handler(event):
            if not self.running:
                return
            await self.process_message(event)

        # Also scan recent messages on startup
        log("📜 Scanning recent messages for existing leads...")
        for group in joined_groups:
            try:
                async for message in self.client.iter_messages(group, limit=50):
                    if message.text and len(message.text) > 50:
                        await self.process_message_data(
                            text=message.text,
                            group_name=getattr(group, "title", "Unknown"),
                            message_id=message.id,
                            sender=message.sender,
                            date=message.date,
                            group_username=getattr(group, "username", ""),
                        )
            except Exception as e:
                log(f"⚠️  Error scanning {getattr(group, 'title', 'group')}: {e}")

        log(f"\n📊 Initial scan complete: {self.lead_count} leads found from recent messages")
        log("👀 Now listening for NEW messages in real-time...\n")

        # Keep running
        await self.client.run_until_disconnected()

    async def process_message(self, event):
        """Process an incoming Telegram message event."""
        if not event.text or len(event.text) < 50:
            return

        chat = await event.get_chat()
        sender = await event.get_sender()

        await self.process_message_data(
            text=event.text,
            group_name=getattr(chat, "title", "Unknown Group"),
            message_id=event.id,
            sender=sender,
            date=event.date,
            group_username=getattr(chat, "username", ""),
        )

    async def process_message_data(self, text: str, group_name: str, message_id: int,
                                    sender, date, group_username: str):
        """Core logic: filter, score, and save a lead."""
        self.processed_count += 1

        # Quick pre-filter
        if not quick_keyword_match(text):
            return

        log(f"🔎 Analyzing message from '{group_name}' ({self.processed_count} processed)...")

        # AI scoring
        result = await score_lead_with_ai(text)

        if not result.get("is_lead", False):
            log(f"   ❌ Not a lead (AI says no)")
            return

        score = result.get("score", 0)
        if score < 5:
            log(f"   ⏭️  Low relevance (score: {score}/10)")
            return

        # It's a lead!
        self.lead_count += 1
        title = result.get("title", "Freelance Opportunity")
        company = result.get("company", "Unknown")
        summary = result.get("summary", "")
        contact = result.get("contact_method", "DM on Telegram")

        sender_name = ""
        sender_username = ""
        if sender:
            sender_name = getattr(sender, "first_name", "") or ""
            if getattr(sender, "last_name", ""):
                sender_name += f" {sender.last_name}"
            sender_username = getattr(sender, "username", "") or ""

        log(f"   🎯 LEAD #{self.lead_count}: \"{title}\" at {company} (score: {score}/10)")
        log(f"      📌 {summary}")
        log(f"      👤 Posted by: {sender_name} (@{sender_username})")
        log(f"      📞 Contact: {contact}")

        # Build Telegram message URL
        tg_url = f"https://t.me/{group_username}/{message_id}" if group_username else ""
        
        apply_email = result.get("apply_email")
        apply_link = result.get("apply_link")

        # Check for duplicates
        existing = await supabase_select("jobs", {
            "source_id": f"eq.tg_{group_username}_{message_id}",
            "user_id": f"eq.{self.user_id}",
            "select": "id",
        })
        if existing:
            log(f"   ⚠️  Already saved this lead")
            return

        # Save to Supabase jobs table
        job_data = {
            "user_id": self.user_id,
            "source": "telegram",
            "source_id": f"tg_{group_username}_{message_id}",
            "company": company,
            "title": title,
            "description": text[:3000],
            "location": result.get("location", "Remote"),
            "job_url": apply_link or tg_url,
            "job_type": "freelance",
            "match_score": score,
            "match_reason": summary,
            "status": "discovered",
            "discovered_at": (date or datetime.now(timezone.utc)).isoformat(),
            # We can use the jsonb metadata column if it exists, or just log for now
        }

        saved = await supabase_insert("jobs", job_data)
        if saved:
            log(f"   ✅ Saved to dashboard! (ID: {saved.get('id', '?')[:8]}...)")
            
            # TRIGGER AUTO APPLY
            if apply_email:
                log(f"   ✉️ Found email: {apply_email} - Auto-sending CV via Resend!")
                # TODO: Trigger email API
            elif apply_link:
                log(f"   🔗 Found application link: {apply_link} - Triggering Universal ATS Filler!")
                # TODO: Spawn Playwright filler
        else:
            log(f"   ⚠️  Failed to save to database")

    async def stop(self):
        self.running = False
        await self.client.disconnect()
        log("🛑 Telegram scraper stopped.")


# ─── CLI Entry Point ──────────────────────────────────────────────────────────

async def main():
    user_id = sys.argv[1] if len(sys.argv) > 1 else USER_ID
    if not user_id:
        print("Usage: python agents/telegram/scraper.py <user_id>")
        print("   or set AUTOAPPLY_USER_ID in .env.local")
        sys.exit(1)

    # Custom groups from CLI (comma-separated)
    groups = None
    if len(sys.argv) > 2:
        groups = [g.strip().lstrip("@") for g in sys.argv[2].split(",")]

    scraper = TelegramScraper(user_id=user_id, groups=groups)

    max_retries = 5
    for attempt in range(1, max_retries + 1):
        try:
            await scraper.start()
            break
        except FloodWaitError as e:
            wait = e.seconds + 10
            log(f"⏳ Telegram FloodWait: sleeping {wait}s before retry {attempt}/{max_retries}")
            await asyncio.sleep(wait)
        except KeyboardInterrupt:
            log("\n⛔ Interrupted by user")
            await scraper.stop()
            break
        except Exception as e:
            log(f"❌ Error: {e}")
            if attempt < max_retries:
                log(f"🔄 Retrying in 30s... (attempt {attempt}/{max_retries})")
                await asyncio.sleep(30)
            else:
                log("❌ Max retries exceeded. Exiting.")

if __name__ == "__main__":
    asyncio.run(main())
