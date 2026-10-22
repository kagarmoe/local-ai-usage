---
name: discord
description: Post messages to Discord channels via webhook from swamp workflows using the @keeb/discord/webhook model. Use when sending notifications, alerts, or status updates to Discord from swamp automation. Triggers on "discord", "discord webhook", "send to discord", "discord notification", "post to channel", "@keeb/discord", or when wiring workflow outputs into a chat message.
---

# @keeb/discord

Swamp extension for posting messages to Discord via incoming webhooks. Single
model, single purpose.

## Model: `@keeb/discord/webhook`

Post a message to a Discord channel using a webhook URL.

### Global arguments

Configured once per model instance in the definition YAML:

| Field        | Type   | Required | Description         |
| ------------ | ------ | -------- | ------------------- |
| `webhookUrl` | string | yes      | Discord webhook URL |

The webhook URL is a secret. Store it in a vault and reference it with a vault
expression — never hardcode.

### Methods

#### `send`

Send a message to the configured webhook.

| Argument   | Type   | Required | Description                                          |
| ---------- | ------ | -------- | ---------------------------------------------------- |
| `content`  | string | yes      | Message body (max 2000 chars; silently truncated)    |
| `username` | string | no       | Override the webhook's default display name per-post |

Writes a `result` resource with `{ success, statusCode, timestamp }`. Throws on
non-2xx responses with the Discord error body included.

### Resources

| Name     | Lifetime | GC | Schema                               |
| -------- | -------- | -- | ------------------------------------ |
| `result` | infinite | 10 | `{ success, statusCode, timestamp }` |

## Defining an instance

```yaml
# definition.yaml
models:
  - name: ops-alerts
    type: "@keeb/discord/webhook"
    globalArguments:
      webhookUrl: "{{ vault.discord.opsWebhook }}"
```

Store the secret first:

```bash
swamp vault set discord opsWebhook 'https://discord.com/api/webhooks/...'
```

## Calling `send` from a workflow

```yaml
# workflows/notify.yaml
jobs:
  notify:
    steps:
      - name: post-alert
        model: ops-alerts
        method: send
        arguments:
          content: "Deploy {{ data.latest('deploy', 'result').attributes.version }} finished"
          username: "swamp-bot"
```

## Running ad-hoc from the CLI

```bash
swamp model run ops-alerts send \
  --arg content="hello from swamp" \
  --arg username="release-bot"
```

## Common patterns

### Wire another model's output into a message

Use CEL via `data.latest(...)` to pull a field from an upstream model. Prefer
this over re-running the upstream model.

```yaml
arguments:
  content: "Build {{ data.latest('ci', 'run').attributes.status }} for {{ data.latest('ci', 'run').attributes.sha }}"
```

### Multiple channels

Declare one model instance per channel, each with its own `webhookUrl` and vault
key. The model itself has no channel concept — one webhook equals one channel.

### Conditional notifications

Use job-level conditions in the workflow to gate the `send` step; the webhook
model has no built-in filtering.

## Gotchas

- **2000 character limit**: `content` over 2000 chars is truncated to 1997 plus
  `"..."`. Split long messages across multiple `send` calls at the workflow
  level if full content matters.
- **Plain content only**: No support for embeds, files, components, threads,
  allowed_mentions, or markdown flags yet. Only `content` and `username` are
  wired through. If you need an embed, extend the model — don't shell out.
- **Username override is per-post**: Setting `username` does not persist on the
  webhook; it only affects that single message.
- **webhookUrl is a secret**: Anyone with the URL can post to the channel.
  Always source it from the vault, never from a plain file or env literal in
  definition YAML.
- **No retries**: A non-2xx response throws immediately. Wrap in workflow-level
  retry if the channel is critical.
- **Rate limits**: Discord enforces per-webhook rate limits. Bulk fan-out from a
  loop will fail with 429; add delays or batch messages yourself.
- **Resource is thin**: `result` only records success/status/time — the message
  body is not stored. Log the content upstream if you need an audit trail.
