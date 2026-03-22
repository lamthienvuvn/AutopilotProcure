# Quick Implementation Guide - Agora Live Agent Fix

## Immediate Actions (5 minutes)

### 1️⃣ Disable Mock Mode
Edit `c:\Users\lamvu\OneDrive\Documents\Lotushacks\.env.local`

**Change line 1 FROM:**
```
FORCE_MOCK_MODE=true
```

**Change TO:**
```
FORCE_MOCK_MODE=false
```

### 2️⃣ Update Test Phone Number
Edit the same `.env.local` file, find line 33:

**Change FROM:**
```
AGORA_ALLOWED_TEST_PHONE="+84832787977"
```

**Change TO (use YOUR phone):**
```
AGORA_ALLOWED_TEST_PHONE="+1234567890"
```

### 3️⃣ Restart Dev Server
```bash
# Kill current dev server
# Run:
npm run dev
```

### 4️⃣ Test the Button
1. Open the dashboard
2. Upload a quote or use the sample quote
3. Click "Start Laptop Demo Call (Agora)" button
4. Allow microphone access
5. Speak with the agent

---

## Component Flow Diagram

```
┌─────────────────────────────────────┐
│ UI: Dashboard Client Component      │
│ (src/components/dashboard-client)   │
└──────────────┬──────────────────────┘
               │ User clicks button
               │ "Start Laptop Demo Call"
               ▼
┌─────────────────────────────────────┐
│ startAgoraPriceCheck(quote)         │
│ - Validates phone number             │
│ - Calls /api/agora/price-check      │
└──────────────┬──────────────────────┘
               │ POST to backend
               ▼
┌─────────────────────────────────────┐
│ API Route: /api/agora/price-check   │
│ (src/app/api/agora/price-check)     │
│                                     │
│ ✓ Read AGORA_APP_CERTIFICATE        │
│ ✓ Generate RTC tokens               │
│ ✓ Create Agora Agent via API        │
│ ✓ Return token + agent ID           │
└──────────────┬──────────────────────┘
               │ Returns session info
               ▼
┌─────────────────────────────────────┐
│ AgoraLiveCallModal Component        │
│ (src/components/agora-live-call...)│
│                                     │
│ ✓ Import agora-rtc-sdk-ng           │
│ ✓ Create RTC client                 │
│ ✓ Join channel with token           │
│ ✓ Enable microphone                 │
│ ✓ Start speech recognition          │
└──────────────┬──────────────────────┘
               │ Audio connection
               ▼
┌─────────────────────────────────────┐
│ Agora RTC Channel                   │
│ (price-check-{timestamp})           │
│                                     │
│ Participants:                       │
│  • Client (browser, you)            │
│  • Agent (Agora-hosted)             │
└──────────────┬──────────────────────┘
               │ Data stream
               ▼
┌─────────────────────────────────────┐
│ Agora Conversational AI Agent       │
│ (Agora cloud)                       │
│                                     │
│ ✓ Listens to client audio           │
│ ✓ Speech-to-Text (ASR)              │
│ ✓ LLM Process (GPT-4o-mini)         │
│ ✓ Text-to-Speech (Microsoft TTS)    │
│ ✓ Calls supplier (outbound)         │
│ ✓ Conducts price negotiation        │
└─────────────────────────────────────┘
```

---

## Environment Variable Dependencies

```
✅ Core API Credentials
├─ AGORA_APP_ID                     (Agora console)
└─ AGORA_AUTH_TOKEN or
   ├─ AGORA_CUSTOMER_ID             (Agora console)
   └─ AGORA_CUSTOMER_SECRET         (Agora console)

✅ RTC Token Generation
├─ AGORA_APP_CERTIFICATE            ⭐ CRITICAL - use this
└─ AGORA_RTC_TOKEN (fallback only)

✅ LLM Configuration
├─ OPENAI_API_KEY                   (OpenAI)
├─ OPENAI_MODEL                     (e.g., gpt-4o-mini)
└─ AGORA_LLM_URL (optional)         (defaults to OpenAI)

✅ Text-to-Speech
├─ AGORA_TTS_KEY                    (Microsoft Azure)
├─ AGORA_TTS_REGION                 (e.g., eastus)
└─ AGORA_TTS_VOICE (optional)       (e.g., en-US-AndrewMultilingualNeural)

✅ Safety & Testing
├─ AGORA_ALLOWED_TEST_PHONE         ⭐ Update to YOUR phone
└─ FORCE_MOCK_MODE                  ⭐ CHANGE TO FALSE
```

---

## Token Generation Deep Dive

### How Dynamic Tokens Work (Recommended)

```typescript
// When AGORA_APP_CERTIFICATE is set:
AGORA_APP_CERTIFICATE="9187bec5836f4cc29f7dce900cc94e31"

// Server does this:
const token = RtcTokenBuilder.buildTokenWithUid(
  appId,                    // From AGORA_APP_ID
  appCertificate,          // From AGORA_APP_CERTIFICATE
  channelName,             // Generated per session
  uid,                     // Unique per user
  RtcRole.PUBLISHER,       // Can publish audio
  expiresIn1Hour           // 1 hour validity
)

// Result: Fresh token every time, no expiration issues
```

### Why AGORA_APP_CERTIFICATE is Better
- ✅ Fresh tokens generated per session (secure)
- ✅ No token expiration issues
- ✅ Automatically handles multiple concurrent calls
- ✅ Server-side control over token validity

### When to Use AGORA_RTC_TOKEN
- ❌ Use only if AGORA_APP_CERTIFICATE is unavailable
- ❌ Tokens can expire mid-call
- ❌ Not recommended for production

---

## Verification Checklist

Before clicking the button, verify:

```
□ FORCE_MOCK_MODE=false                    (not true!)
□ AGORA_APP_ID is set and correct
□ AGORA_APP_CERTIFICATE is set and correct
  └─ From Agora Console > Project > Primary Certificate
□ AGORA_AUTH_TOKEN or (CUSTOMER_ID + SECRET) is set
□ OPENAI_API_KEY is valid and has credits
□ AGORA_TTS_KEY + AGORA_TTS_REGION are set
  └─ From Microsoft Azure Text-to-Speech
□ AGORA_ALLOWED_TEST_PHONE matches your phone number
□ Dev server restarted after env changes
```

---

## Testing Commands

### Test via UI (Recommended)
```bash
npm run dev
# Navigate to dashboard, click button, speak with agent
```

### Test via CLI
```bash
# Test join+leave flow
npm run test:agora:voice -- --phone="+1234567890" --leave --waitMs=2500

# Test with custom supplier name
npm run test:agora:voice -- --supplier="Laser Circuits Inc" --phone="+1234567890" --leave

# Test with custom channel name
npm run test:agora:voice -- --channel="my-test-123" --leave

# Use basic auth instead of token
npm run test:agora:voice -- --auth=basic --phone="+1234567890" --leave
```

Expected output:
```json
{
  "mode": "live",
  "channelName": "price-check-1234567890123",
  "agentId": "agent_xxxx",
  "status": "RUNNING",
  "rtc": {
    "appId": "...",
    "channelName": "...",
    "token": "...",
    "tokenExpiresAt": 1234567890
  }
}
```

---

## Debugging Tips

### If Button Doesn't Show
```
Reason: agoraFollowUpSuggested is false
Location: src/components/dashboard-client.tsx:2373
Solution: Quote must have agoraFollowUpSuggested=true AND have contact phone/email
```

### If Button Shows But Disabled
```
Reason: startingAgoraSupplierId is set (previous call in progress)
Solution: Click "Stop Active Agora Session" button first
```

### If Modal Doesn't Open
```
Reason: Check browser console for RTC join errors
Common: "CAN_NOT_GET_GATEWAY_SERVER" → Invalid token
Solution: Verify AGORA_APP_CERTIFICATE is correct
```

### If Agent Doesn't Respond
```
Reason: Check these in order:
1. OpenAI API key valid? (test: curl https://api.openai.com)
2. TTS credentials valid? (AGORA_TTS_KEY + REGION)
3. Agent logs in Agora Console showing errors?
4. Supplier phone actually reachable?
```

---

## Security Notes

⚠️ **DO NOT commit `.env.local` to Git**
- Already in `.gitignore` ✓

⚠️ **Phone Number Restriction**
- All calls restricted to `AGORA_ALLOWED_TEST_PHONE` (safety feature)
- Update it to YOUR number for testing
- In production, make this configurable per user

⚠️ **Token Expiry**
- Dynamic tokens expire in 1 hour
- For long calls, implement token refresh
- See: `src/app/api/agora/price-check/route.ts:71-87`

---

## References Used
- Official Agora SDK: `agora-rtc-sdk-ng@4.24.3`
- Token Builder: `agora-token@2.0.5`
- Test script: `test-agora-voice.mjs` (your existing test)
- Agora Community: https://github.com/AgoraIO-Community
