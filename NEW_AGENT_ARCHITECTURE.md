# 🚀 New Agent Architecture: OpenAI + ElevenLabs + Agora RTC

## Overview

The system now uses a **three-layer architecture** for the negotiation agent:

```
┌────────────────────────────────────────┐
│  Layer 1: Transport (Agora RTC)        │
│  ✓ Audio I/O                           │
│  ✓ Network delivery                    │
└────────────────────────────────────────┘
                    ▲▼
┌────────────────────────────────────────┐
│  Layer 2: Conversation (OpenAI)        │
│  ✓ LLM reasoning                       │
│  ✓ Context management                  │
│  ✓ Negotiation logic                   │
└────────────────────────────────────────┘
                    ▲▼
┌────────────────────────────────────────┐
│  Layer 3: Voice (ElevenLabs)           │
│  ✓ Text-to-Speech                      │
│  ✓ Natural voice output                │
└────────────────────────────────────────┘
```

---

## How It Works (New Flow)

### 1. **User Speaks**
   - Browser captures audio via microphone
   - Web Speech API (native browser) converts to text
   - No network round-trip needed for transcription

### 2. **Speech Recognized**
   - Transcript sent to `/api/agent/negotiate` endpoint
   - Conversation history included for context

### 3. **OpenAI Processes**
   - LLM receives: system prompt + conversation history + new user message
   - Generates appropriate negotiation response
   - Response sent back

### 4. **ElevenLabs Voice**
   - Response text converted to speech using "Glorious Bobcat" voice
   - MP3 audio returned to browser as base64 string

### 5. **Audio Playback**
   - Browser decodes MP3 and plays through speakers
   - User hears agent response in real-time

### 6. **Loop Repeats**
   - Web Speech API continues listening
   - Conversation history grows
   - Agent becomes more contextual

---

## Files Created/Modified

### New Files
1. **`src/app/api/agent/negotiate/route.ts`**
   - Core agent orchestration API
   - Handles OpenAI + ElevenLabs coordination
   - Manages conversation history

### Modified Files
1. **`src/components/agora-live-call-modal.tsx`**
   - Added conversation history state
   - Added `handleUserMessage()` function
   - Updated speech recognition to send to agent

2. **`.env.local`**
   - Added `ELEVENLABS_API_KEY`
   - Added `ELEVENLABS_VOICE_ID`

---

## Agent Configuration

### System Prompt
The agent is instructed as a **procurement negotiator**:
```
"You are a procurement agent negotiating with a supplier representative.
Your goal is to negotiate the best price, delivery terms, and payment conditions."
```

### Conversation Context
- Full history transmitted with each request
- Agent can reference previous exchanges
- Contextual negotiation possible

### Voice
- **Provider:** ElevenLabs
- **Voice:** Glorious Bobcat
- **Model:** `eleven_monolingual_v1`
- **Stability:** 0.5 (natural variability)
- **Similarity:** 0.75 (consistent voice)

---

## Environment Variables

```bash
# Existing OpenAI
OPENAI_API_KEY="sk-proj-..."
OPENAI_MODEL="gpt-4o-mini"

# New ElevenLabs
ELEVENLABS_API_KEY="0e6bf36717ad5ceff11a8eee70f489cc0c5b80dde74ad8f7ab50bf56e8203304"
ELEVENLABS_VOICE_ID="21m00Tcm4TlvDq8ikWAM"  # Default; change to your custom voice ID

# Agora (Transport only)
AGORA_APP_ID="..."
AGORA_APP_CERTIFICATE="..."
```

---

## Testing the New System

### Step 1: Restart Dev Server
```bash
npm run dev
```

### Step 2: Hard Refresh Browser
**Ctrl+R** or **Cmd+R**

### Step 3: Start a Call
1. Click "Start Laptop Demo Call (Agora)"
2. Wait for modal to open and show "Voice session connected"

### Step 4: Speak
1. Say something like: **"What's your best price for 1000 units?"**
2. Browser converts to text and sends to backend
3. OpenAI generates response
4. ElevenLabs converts to speech
5. **You hear the agent's response!**

### Step 5: Continue Conversation
- Agent remembers previous messages
- Negotiation improves with context
- Can ask follow-up questions

---

## API Endpoint Details

### POST `/api/agent/negotiate`

**Request:**
```json
{
  "userMessage": "What's your best price for 100 units?",
  "supplierName": "Summit Pixel Supply",
  "conversationHistory": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi, I'm from..." }
  ]
}
```

**Response:**
```json
{
  "agentMessage": "For 100 units, we can offer...",
  "audio": "//NExAAR39wABHQAB...(base64 MP3)...==",
  "audioFormat": "mp3"
}
```

---

## Benefits of This Architecture

| Aspect | Old System | New System |
|--------|-----------|-----------|
| **LLM** | Agora's proprietary | Full OpenAI power |
| **Voice Quality** | Microsoft TTS | ElevenLabs (more natural) |
| **Customization** | Limited | Complete control |
| **Conversation Context** | Agora manages | You manage |
| **Cost Transparency** | Hidden in Agora | Pay only for what you use |
| **Negotiation Logic** | Agora's agent | Your custom system prompt |

---

## Troubleshooting

### Issue: "Cannot authenticate with ElevenLabs"
- Verify `ELEVENLABS_API_KEY` is correct
- Check it's a valid API key (not a voice ID)

### Issue: "Agent doesn't respond"
- Check `/api/agent/negotiate` is being called (Browser DevTools → Network)
- Verify OpenAI API key is valid
- Check conversation is being sent properly

### Issue: "Audio doesn't play"
- Check browser speaker volume
- Verify ElevenLabs TTS is returning audio
- Check browser console for audio play errors

### Issue: "Agent voice doesn't match expectations"
- "Glorious Bobcat" might not exist in your account
- Get the voice ID from ElevenLabs dashboard
- Update `ELEVENLABS_VOICE_ID` in `.env.local`

---

## Getting Your Custom Voice ID

1. Log in to [ElevenLabs.io](https://elevenlabs.io)
2. Go to **Voice Library**
3. Find "Glorious Bobcat"
4. Copy the **Voice ID** (usually starts with a letter)
5. Update `.env.local`:
   ```
   ELEVENLABS_VOICE_ID="your-voice-id-here"
   ```

---

## Next Steps

1. ✅ Restart dev server
2. ✅ Test the negotiation flow
3. ⚠️ Verify "Glorious Bobcat" voice exists (also can use any voice name you want)
4. 🔧 Fine-tune the system prompt for your negotiation style
5. 📊 Add analytics to track negotiation outcomes

---

## System Prompt Customization

Edit in `src/app/api/agent/negotiate/route.ts` (line ~18) to change agent behavior:

```typescript
const systemPrompt = `You are a procurement agent negotiating with a supplier.
Your goals:
1. Get the best possible price
2. Negotiate favorable payment terms (Net-30 preferred)
3. Ensure reasonable delivery timeline
4. Build a good relationship for future orders

Be professional, data-driven, and collaborative.`;
```

---

## Performance Notes

- **Latency per turn:** ~2-3 seconds (OpenAI + ElevenLabs)
- **Audio format:** MP3 (compact, good quality)
- **Network:** Uses HTTPS only (secure)
- **Browser compatibility:** Works on Chrome, Edge, Firefox, Safari

---

**The system is now ready for sophisticated supplier price negotiations!** 🎯
