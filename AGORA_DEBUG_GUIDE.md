# Debugging Garbled Agent Messages

## Current Issue
The modal connects successfully but agent messages appear as garbled text instead of readable responses.

## What Changed
I've added enhanced debugging to `.src/components/agora-live-call-modal.tsx` to help identify the exact format the agent is sending.

## How to Debug

### Step 1: Open Browser DevTools
1. Press **F12** (or right-click → Inspect)
2. Go to **Console** tab
3. Filter by: `Agora` (to see debug logs)

### Step 2: Start a Call and Check Logs
1. Click "Start Laptop Demo Call (Agora)"
2. Wait for "Connected" status
3. **Don't speak yet** - wait 3-5 seconds for agent greeting
4. Check console logs

### What to Look For

You should see console messages like:
```
[Agora] Raw stream message: {"text":"Hello! I'm representing..."}
[Agora] Parsed agent message: Hello! I'm representing...
```

Or if there's an issue:
```
[Agora] Raw stream message: [some garbled/unexpected format]
[Agora] Could not parse message, raw: [the raw data]
```

### Step 3: Share the Console Output

The raw stream message will tell us exactly what format the Agora agent is sending, and we can fix the parser accordingly.

## Possible Outcomes

### ✅ Best Case
The new parsing logic understands the format and displays readable text.

### 🟠 If Still Garbled
You'll see the raw format in console. Copy it and we can update the parser to handle it.

### 🔴 If No Messages Appear
Check for errors mentioning:
- "token expired"
- "authentication failed"
- "gateway error"

---

## Restart Instructions

1. **Kill the dev server** (Ctrl+C in terminal)
2. **Run:** `npm run dev`
3. **Refresh browser** (Ctrl+R or Cmd+R)
4. **Try the flow again**

---

## Alternative: CLI Diagnostic Test

Instead of using the UI, run this to get cleaner output:

```bash
npm run test:agora:voice -- --phone="+84832787977" --leave --waitMs=3000
```

This creates an agent session without the UI complexity and shows you exactly what the API returns.

---

## Expected Response Format

From your current setup, the agent should return something like:

```json
{
  "text": "Hello! I'm representing Summit Pixel Supply. How can I help you today with your procurement needs?"
}
```

Or possibly:

```json
{
  "message": "Hello! I'm representing...",
  "timestamp": 1234567890
}
```

The enhanced parser now checks many possible field names, so it should handle multiple formats.

---

**Once you have the console output, let me know what the "Raw stream message" shows, and I can make sure it's parsed correctly.**
