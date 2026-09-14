# Card Sync Automation

This document describes the automated card synchronization workflow for RiftBrewery.

## Overview

The card sync automation checks for new Riftbound sets every Monday at 2 AM UTC. If new sets are detected, a full synchronization of cards and data is triggered automatically. This ensures the database stays up-to-date without manual intervention.

## How It Works

### Two-Stage Pipeline

The automation uses a two-job GitHub Actions workflow:

1. **Check for New Sets** (`check-new-sets` job)
   - Fetches `/sets` endpoint from api.riftcodex.com
   - Compares the API set_ids with what's already in the `card_sets` table
   - Outputs a flag (`sync-needed`) indicating if new sets were found
   - Takes ~30 seconds

2. **Sync Cards** (`sync-cards` job)
   - Runs only if new sets were detected
   - Fetches and indexes all cards, sets, and metadata
   - Upserts everything into the database in a single transaction
   - Takes 2-3 minutes

### Exit Codes

- `check_sync_needed.py` returns 0 if new sets are found (sync needed)
- `check_sync_needed.py` returns 1 if no new sets (sync not needed)

## Schedule

The automation runs on a cron schedule:

```
0 2 * * 1
```

This means:
- **Time:** 2 AM UTC (10 PM ET, 7 PM PT)
- **Day:** Every Monday

To adjust the schedule, edit `.github/workflows/sync-cards.yml` and modify the `cron` value.

### Common Cron Expressions

- `0 2 * * 1` - Weekly, Monday 2 AM UTC
- `0 2 * * *` - Daily at 2 AM UTC
- `0 2 * * 1,4` - Twice per week (Monday and Thursday)
- `0 */6 * * *` - Every 6 hours

[Learn more about cron syntax](https://crontab.guru/)

## Monitoring

### GitHub Actions Tab

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. Find the "Sync Cards" workflow
4. Click on a run to see:
   - Job status (passed/failed)
   - Detailed logs from each step
   - Timing information
   - Any errors encountered

### Manual Trigger

To run the sync immediately without waiting for the scheduled time:

1. Go to the **Actions** tab
2. Click **Sync Cards** on the left
3. Click **Run workflow** (blue button)
4. Select the branch (usually `main`)
5. Click **Run workflow**

The workflow will start within seconds.

## Setup

### Prerequisites

- This project must be in GitHub
- The workflow file is at `.github/workflows/sync-cards.yml`

### Add the DATABASE_URL Secret

The workflow needs access to your database. Add the secret:

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `DATABASE_URL`
5. Value: Your full Postgres connection string (e.g., `postgresql://user:pass@host:5432/dbname`)
6. Click **Add secret**

Without this secret, the workflow will fail with a DATABASE_URL error.

## Troubleshooting

### "DATABASE_URL is not set" Error

The secret hasn't been added to GitHub. Follow the setup instructions above.

### API Returns Non-JSON Response

The Riftcodex API is blocking the request (usually Cloudflare). The script retries automatically with exponential backoff. If this persists:
- Check if api.riftcodex.com is accessible
- The curl_cffi library may need updates

### Database Connection Timeout

- Verify the DATABASE_URL is correct
- Ensure the database is reachable from GitHub's runners
- Check if the database credentials are valid

### New Sets Detected but Sync Failed

The `check-new-sets` job succeeded, but `sync-cards` failed. This could be:
- Database schema has changed
- API response format is different
- Network timeout during sync

Check the workflow logs for the specific error.

## Implementation Details

### check_sync_needed.py

Located at `scripts/check_sync_needed.py`. This script:
- Uses curl_cffi to bypass Cloudflare
- Fetches paginated `/sets` endpoint
- Queries the database for existing set_ids
- Compares the two lists
- Prints progress to stdout
- Returns exit code 0 (new sets) or 1 (no new sets)

Uses the same `.env.local` loading as `sync_cards.py` for consistency.

### sync_cards.py

Located at `scripts/sync_cards.py`. This is the existing full synchronization script that:
- Fetches all sets and cards from the API
- Normalizes data according to internal schema
- Validates all types and relationships
- Performs transactional upserts into:
  - `card_sets` table
  - `cards` table
  - `card_indexes` table (keywords, rarities, etc.)

### GitHub Actions Workflow

Located at `.github/workflows/sync-cards.yml`. Uses:
- `ubuntu-latest` runner
- Python 3.12
- 5-minute timeout per job
- Conditional job dependencies (sync only if check passes)

## Related Documentation

- [Sync Pipeline Overview](./sync-pipeline.md)
- [Database Schema](./database.md)
- [API Reference](./api.md)
