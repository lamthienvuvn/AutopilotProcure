# Agora Live Agent Issue - Analysis & Fix Guide

## Problem Summary
The "Start Laptop Demo Call (Agora)" button is not working to initiate a live voice call with the Agora agent for price negotiation with suppliers.

## Root Causes Identified

### 1. **PRIMARY ISSUE: FORCE_MOCK_MODE=true** 🔴
**Location:** `.env.local` line 1
```
FORCE_MOCK_MODE=true
```

**Impact:** This forces the entire application into mock mode, preventing any real Agora agent calls from being initiated. When in mock mode, the API calls to Agora are mocked/simulated and don't create actual voice sessions.

**Fix:** Change to:
```
FORCE_MOCK_MODE=false
```

---

### 2. **Missing AGORA_CLIENT_RTC_TOKEN** 🟠
**Location:** `.env.local` (missing)

**Impact:** The price-check endpoint requires `AGORA_CLIENT_RTC_TOKEN` for the browser-side to join the RTC channel. Without this, the client cannot establish the audio connection even if the agent is created.

**Code Location:** `src/app/api/agora/price-check/route.ts` lines 158-169
```typescript
if (!clientRtcToken) {
  return NextResponse.json(
    {
      error:
        "Missing client RTC token. Set AGORA_APP_CERTIFICATE for dynamic token generation, or set AGORA_CLIENT_RTC_TOKEN for browser join.",
    },
    { status: 500 },
  );
}
```

**Solutions (choose one):**

**Option A: Use Dynamic Token Generation (RECOMMENDED)**
- Set `AGORA_APP_CERTIFICATE` with your Agora App Certificate
- The server will automatically generate fresh tokens for each session
- This is the most secure and flexible approach

**Option B: Use Static Token for Browser**
- Generate a static RTC token from Agora Console
- Add to `.env.local`:
```
AGORA_CLIENT_RTC_TOKEN="<your generated token>"
```

---

## Configuration Checklist

### ✅ Currently Configured (in .env.local)
- ✅ AGORA_APP_ID - Configured
- ✅ AGORA_AUTH_TOKEN - Configured (token-based auth)
- ✅ AGORA_CUSTOMER_ID - Configured (backup basic auth)
- ✅ AGORA_CUSTOMER_SECRET - Configured (backup basic auth)
- ✅ AGORA_TTS_KEY - Configured (Microsoft Text-to-Speech)
- ✅ AGORA_TTS_REGION - Configured (eastus)
- ✅ AGORA_ALLOWED_TEST_PHONE - Configured (+84832787977)
- ✅ OPENAI_API_KEY - Configured
- ✅ OPENAI_MODEL - Configured (gpt-4o-mini)

### ❌ Missing Configuration
- ❌ AGORA_CLIENT_RTC_TOKEN - OR AGORA_APP_CERTIFICATE for dynamic token generation
- ❌ FORCE_MOCK_MODE should be 'false'

---

## How It Works (Technical Flow)

### Current Flow When Working:
1. User clicks "Start Laptop Demo Call (Agora)" button
   - **Location:** `src/components/dashboard-client.tsx:2407-2418`

2. `startAgoraPriceCheck(quote, "laptop-demo")` is called
   - **Location:** `src/components/dashboard-client.tsx:843-941`

3. POST to `/api/agora/price-check` with:
   ```json
   {
     "supplierName": "...",
     "phoneNumber": "+84832787977",
     "systemPrompt": "..."
   }
   ```

4. Backend creates Agora Conversational AI Agent:
   - **Location:** `src/app/api/agora/price-check/route.ts:96-298`
   - Calls Agora API: `https://api.agora.io/api/conversational-ai-agent/v2/projects/{appId}/join`
   - Agent starts RTC session in channel: `price-check-{timestamp}`
   - Generates RTC tokens for both agent and client

5. Browser loads `AgoraLiveCallModal` component
   - **Location:** `src/components/agora-live-call-modal.tsx`
   - Uses Agora RTC SDK to join the channel
   - Enables microphone input
   - Streams audio to agent
   - Transcribes agent responses using browser's SpeechRecognition API

6. Agent calls the supplier phone number:
   - Uses OpenAI GPT-4o-mini LLM for conversation logic
   - Text-to-Speech via Microsoft's TTS service
   - Speech-to-Text via browser's built-in ASR

---

## Step-by-Step Fix Instructions

### Step 1: Switch Off Mock Mode
Edit `.env.local`:
```
FORCE_MOCK_MODE=false
```

### Step 2: Configure RTC Token Generation

**Recommended Approach: Use AGORA_APP_CERTIFICATE for Dynamic Tokens**

The `.env.local` already has:
```
AGORA_APP_CERTIFICATE="9187bec5836f4cc29f7dce900cc94e31"
```

This should work! But you can verify by checking:
1. Log into [Agora Console](https://console.agora.io)
2. Go to your project
3. Copy the "App Certificate" (not the App ID)
4. Update `.env.local` with the correct certificate

When `AGORA_APP_CERTIFICATE` is set:
- Server generates fresh RTC tokens per session (code: `route.ts:140-156`)
- Tokens expire in 1 hour (tokens are valid for server-generated tokens)
- All clients get unique UIDs to prevent conflicts (code: `route.ts:90-94`)

### Step 3: Verify Test Phone Number

The system restricts calls to a test phone number for safety:
```
AGORA_ALLOWED_TEST_PHONE="+84832787977"
```

**Change this to YOUR phone number for testing:**
```
AGORA_ALLOWED_TEST_PHONE="+1234567890"
```

To update the UI warning message, edit `src/components/dashboard-client.tsx:2377`:
```typescript
<p className="text-xs text-amber-700">
  Missing live price. For safety, Agora test call is restricted to +1234567890.
</p>
```

### Step 4: Test the Setup

#### Option A: Test via UI
1. Restart the Next.js dev server: `npm run dev`
2. Navigate to the dashboard
3. Upload/scan a quote
4. Click "Start Laptop Demo Call (Agora)"
5. Allow microphone access
6. Speak to the agent

#### Option B: Test via Command Line
```bash
npm run test:agora:voice -- --phone="+1234567890" --leave --waitMs=5000
```

This will:
- Create an Agora agent session
- Wait 5 seconds
- Stop the agent gracefully
- Log all responses

Testing script location: `test-agora-voice.mjs`

---

## Troubleshooting Guide

### Issue: "Test calls are restricted to..."
**Cause:** Requested phone doesn't match `AGORA_ALLOWED_TEST_PHONE`
**Fix:** Update the environment variable or change your supplier's phone number

### Issue: "Missing client RTC token"
**Cause:** Neither `AGORA_APP_CERTIFICATE` nor `AGORA_CLIENT_RTC_TOKEN` is set
**Solution:**
- Set `AGORA_APP_CERTIFICATE` (already in .env.local)
- Or generate static token and set `AGORA_CLIENT_RTC_TOKEN`

### Issue: "Agora join request failed with HTTP 401"
**Cause:** Authentication failed (wrong token/secret)
**Fix:**
1. Check if `AGORA_AUTH_TOKEN` is correct
2. Or verify `AGORA_CUSTOMER_ID` and `AGORA_CUSTOMER_SECRET`
3. Log in to Agora Console and regenerate if needed

### Issue: "CAN_NOT_GET_GATEWAY_SERVER"
**Cause:** RTC token is invalid or expired
**Fix:**
- Ensure `AGORA_APP_CERTIFICATE` is correct and valid
- Delete static `AGORA_RTC_TOKEN` and let server generate tokens

### Issue: Microphone not working
**Cause:** Browser doesn't have permission or uses a non-supporting browser
**Fix:**
- Use Chrome/Edge (Safari/Firefox have limitations)
- Check browser console for permission errors
- Grant microphone access when prompted

### Issue: Agent doesn't speak back
**Cause:** TTS configuration issue
**Fix:**
1. Verify `AGORA_TTS_KEY` is valid
2. Check `AGORA_TTS_REGION` matches your key's region (eastus for example)
3. Verify `AGORA_TTS_VOICE` exists in Microsoft TTS

---

## GitHub References

### Official Agora Community Implementations
- **Agora Conversational AI Agent Creator**
  - Repo: https://github.com/AgoraIO-Community/Agora-Conversational-AI-Agent-Creator
  - Reference for official patterns and best practices

### Your Project References
- **Main Component:** `src/components/dashboard-client.tsx`
- **Modal Component:** `src/components/agora-live-call-modal.tsx`
- **Backend API:** `src/app/api/agora/price-check/route.ts`
- **Stop API:** `src/app/api/agora/price-check/stop/route.ts`
- **Test Script:** `test-agora-voice.mjs`

---

## Summary of Required Changes

| Item | Current | Required | File/Location |
|------|---------|----------|---|
| FORCE_MOCK_MODE | true | false | .env.local:1 |
| AGORA_ALLOWED_TEST_PHONE | +84832787977 | YOUR_PHONE | .env.local:33 |
| AGORA_APP_CERTIFICATE | SET ✅ | Verify correct cert | .env.local:23 |
| AGORA_CLIENT_RTC_TOKEN | NOT SET | Auto-generated (recommended) | route.ts handles it |

---

## Next Steps

1. **Change FORCE_MOCK_MODE to false** in `.env.local`
2. **Update AGORA_ALLOWED_TEST_PHONE** to your test phone number
3. **Verify AGORA_APP_CERTIFICATE** is correct in Agora Console
4. **Restart dev server:** `npm run dev`
5. **Test the flow** by clicking the button
6. **If error occurs, run test script:** `npm run test:agora:voice -- --phone="+your-number" --leave`
